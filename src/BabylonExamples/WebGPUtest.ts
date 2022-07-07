import { decoderForImage } from "@/dicom_main/decoder";
import {
    Scene,
    Engine,
    FreeCamera,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    Texture,
    RawTexture,
    Color3,
    StandardMaterial,
    UniformBuffer,
    ComputeShader,
    StorageBuffer,
    WebGPUEngine,
    FilesInput,
    Tools,
    float,
    Mesh,
    VertexData,
    PointLight,
    ArcRotateCamera,
    DirectionalLight,
    FollowCamera,
    ShaderMaterial,
    ShaderLanguage,
} from "@babylonjs/core";
import { ImageSize } from "@/dicom_main/image/Types";
import * as dicomjs from '../dicom_main'
import { Voxel } from "./myVoxel";
import { Float16Array } from "@petamoriken/float16";
import { pbrVertexShader } from "babylonjs/Shaders/pbr.vertex";


const AllDicomPixelData: Int16Array[] = []
//const AllDicomPixelData: Float32Array[] = []

const threshold = 150

let SurfaceVoxels: Voxel[][]

const surfaceNumber: number[] = new Array(105)

const bufs = new ArrayBuffer(512 * 512 * 128 * 4)

declare enum GPUShaderStage {

    VERTEX = 0x1,
    FRAGMENT = 0x2,
    COMPUTE = 0x4
}
declare enum GPUBufferUsage {
    MAP_READ = 0x0001,      // 映射并用来独取
    MAP_WRITE = 0x0002,     // 映射并用来写入
    COPY_SRC = 0x0004,      // 可以作为拷贝源
    COPY_DST = 0x0008,      // 可以作为拷贝目标
    INDEX = 0x0010,         // 索引缓存
    VERTEX = 0x0020,        // 顶点缓存
    UNIFORM = 0x0040,       // Uniform 缓存
    STORAGE = 0x0080,       // 仅存储型缓存
    INDIRECT = 0x0100,      // 间接使用
    QUERY_RESOLVE = 0x0200  // 用于查询
}

// eslint-disable-next-line prefer-const
//let pixelSpace = 0;
//let sliceThickness = 0;


export class WebGPUtest {

    scene!: Scene;
    engine!: Engine;
    engineGPU!: WebGPUEngine;

    adapter!: GPUAdapter;
    context!: GPUCanvasContext;
    pipeline!: GPURenderPipeline;
    computePipeline!: GPUComputePipeline;

    bindGroup!: GPUBindGroup;
    computeBindGroup!: GPUBindGroup;

    constructor(private canvas: HTMLCanvasElement) {
        const engine = new WebGPUEngine(canvas);
        engine.initAsync().then(() => {
            //console.log(engine._device)
            this.engine = engine
            this.engineGPU = engine
            this.context = canvas.getContext("webgpu") as unknown as GPUCanvasContext
            //console.log(this.context)
            this.scene = this.CreateScene();
            engine.runRenderLoop(() => {
                this.scene.render()
            })
        })
    }
    CreateScene() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        console.log(this.engine)

        const scene = new Scene(this.engine);

        const camera = new FreeCamera("camera", new Vector3(0, 1, -5), this.scene);
        camera.setTarget(Vector3.Zero());
        camera.attachControl();
        // const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        // light.intensity = 0.7;
        // const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2, segments: 32 }, scene);
        // sphere.position.y = 1;
        // const ground = MeshBuilder.CreateGround("ground", { width: 6, height: 6 }, scene);

        if (!this.checkComputeShadersSupported(this.engine, scene)) {
            console.log("not support webgpu")
            return scene;
        }
        console.log("webgpu initgialed.")

        //////Computer ShaderCompute//
        const addVector =  /* wgsl */ `
        struct Params {
            threshold:f32,
            pixelSpace:f32,
            sliceThickness:f32,
        };
            @group(0) @binding(0) var<storage, read_write> vector1 : array<f32>;
            @group(0) @binding(1) var<storage, write> vectorResult : array<f32>;
            //@group(0) @binding(2) var<uniform> params : Params;
            @compute @workgroup_size(1,1,1)

        fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
            let idx = global_id.x + global_id.y*512 + global_id.z*512*512;

            //var vector2 = array<f32, 6>(0.0, 0.5, -0.5, -0.5, 0.5, -0.5);
            // vectorResult[idx] = vector1[idx] + params.sliceThickness;
            vectorResult[idx] = vector1[idx] + 0.5;
            //vectorResult[idx] = vector1[idx] + params.sliceThickness + globe3DTo1DIndex(global_id.x, global_id.y, global_id.z);
        }

        fn aa()->vec3<f32>{
            return vec3(1,2,3);
        }

        fn globe3DTo1DIndex(globalx: u32, globaly: u32, globalz: u32) -> f32{
            return f32(globalx + globaly * 511 + globalz * 511 * 105);
        }
    `;

        const wgslVertex = /* wgsl */`
        @group(0) @binding(1) var<storage, read> vectorResult : array<f32>;
         @vertex
         fn main(@builtin(vertex_index) VertexIndex : u32)-> @builtin(position) vec4<f32> {
              var pos = array<vec2<f32>, 3>(
                  vec2<f32>(vectorResult[0], vectorResult[1]),
                  vec2<f32>(vectorResult[2], vectorResult[3]),
                  vec2<f32>(vectorResult[4], vectorResult[5]));
            
              return vec4<f32>(pos[VertexIndex], 1.0, 1.0);
            }
        `
        const wgslFragment = /* wgsl */`
        @fragment
            fn main() -> @location(0) vec4<f32> {
              return vec4<f32>(1.0, 0.0, 0.0, 1.0);
            }`


        /////讀檔///
        const filesInput = new FilesInput(this.engine, scene, null, null, null, null, function () {
            Tools.ClearLogCache()
        }, null, null);

        filesInput.onProcessFileCallback = (function (file: File, name: string, extension: string) {
            console.log("done: " + (typeof file) + " " + name + " " + extension);
            const reader = new FileReader()
            reader.onload = (ev) => {
                ////解譯Dicom
                const image = dicomjs.parseImage(new DataView(reader.result as ArrayBuffer))
                const decoder = decoderForImage(image!);
                decoder!.outputSize = new ImageSize(image!);
                const imageInfo = decoder?.image;
                const pixelDataPromise = decoder!.getFrame2() // promise<>
                pixelDataPromise.then(async pixelData => {
                    const buffer = new Int16Array(pixelData?.buffer, pixelData.byteOffset, pixelData.byteLength / 2);

                    AllDicomPixelData.push(buffer);
                    if (AllDicomPixelData.length == 105) {
                        for (let i = 0; i < AllDicomPixelData.length; i++) {
                            const a1 = AllDicomPixelData[i];
                            const dst2 = new DataView(bufs, 512 * 512 * i * 4, 512 * 512 * 4)
                            console.log(dst2)
                            for (let j = 0; j < a1.length; j++) {
                                const a2 = a1[j];
                                dst2.setFloat32(j * 4, a2, true);
                            }
                        }
                        console.log("bufs float32 array", new Float32Array(bufs));

                        const device = that.engineGPU._device   ////device = GPUDevice

                        // const CS1 = new ComputeShader("add", that.engine, { computeSource: addVector }, {
                        //     bindingsMapping: {
                        //         "vector1": { group: 0, binding: 0 },
                        //         "vectorResult": { group: 0, binding: 1 },
                        //         "params": { group: 0, binding: 2 },
                        //     }
                        // });

                        //requestAnimationFrame(that.render.bind(that))

                        ////compute Shader Uniform 定義
                        const paramsBuffer = new UniformBuffer(that.engine)

                        paramsBuffer.addUniform("threshold", 1)
                        paramsBuffer.addUniform("pixelSpace", 1)
                        paramsBuffer.addUniform("sliceThickness", 1)

                        ////更新 Uniform 變數
                        paramsBuffer.updateFloat("threshold", threshold)
                        // paramsBuffer.updateFloat("pixelSpace", pixelSpace)
                        // paramsBuffer.updateFloat("sliceThickness", sliceThickness)
                        paramsBuffer.update();


                        // const vector1 = bufs;
                        const vector1 = new Float32Array([0.0, 1, -0.5, -0.5, 0.5, -0.5]);
                        const ssboInput = device.createBuffer({
                            mappedAtCreation: false,
                            size: vector1.byteLength,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                        });

                        // const arrayBufferVector1 = ssboInput.getMappedRange();
                        // new Float32Array(arrayBufferVector1).set(vector1);
                        // ssboInput.unmap();

                        ////data update
                        device.queue.writeBuffer(ssboInput, 0, vector1, 0, 6)

                        
                        const ssboOutput = device.createBuffer({
                            mappedAtCreation: false,
                            size: vector1.byteLength,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                        });
                        
                        const computeBindGroupLayout = device.createBindGroupLayout({
                            entries: [
                                {
                                    binding: 0,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "storage" }
                                },
                                {
                                    binding: 1,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "storage" }
                                }
                            ]
                        });
                        const computeBindGroup = device.createBindGroup({
                            layout: computeBindGroupLayout,
                            entries: [
                                {
                                    binding: 0,
                                    resource: { buffer: ssboInput }
                                },
                                {
                                    binding: 1,
                                    resource: { buffer: ssboOutput }
                                }
                            ]
                        });
                        that.computeBindGroup = computeBindGroup;
                        
                        const computePipeLineLayout = device.createPipelineLayout({
                            bindGroupLayouts: [computeBindGroupLayout]
                        })
                        
                        that.computePipeline = device.createComputePipeline({
                            compute: {
                                module: device.createShaderModule({
                                    code: addVector
                                }),
                                entryPoint: "main"
                            },
                            layout: computePipeLineLayout
                        })

                        //////init to StorageBuffer
                        //const ssboInput = new StorageBuffer(that.engine, vector1.byteLength);
                        //ssboInput.update(vector1);
                        //const ssboOutput = new StorageBuffer(that.engine, vector1.byteLength);

                        // CS1.setStorageBuffer("vector1", ssboInput)
                        // CS1.setStorageBuffer("vectorResult", ssboOutput)
                        // CS1.setUniformBuffer("params", paramsBuffer);

                        // CS1.dispatchWhenReady(511, 511, 104).then(() => {
                        //     ssboOutput.read().then((result) => {
                        //         const resultVector = new Float32Array(result.buffer);
                        //         console.log("0", resultVector);
                        //     })
                        // })



                        ////create ssbo for Vertex Shader
                        // const ssbo1 = device.createBuffer({
                        //     size: 6 * 4,
                        //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        //     mappedAtCreation: false,
                        //     label: "ssbo1"
                        // })

                        // const pos = new Float32Array([0.0, 1, -0.5, -0.5, 0.5, -0.5])

                        // ////data update
                        // device.queue.writeBuffer(ssbo1, 0, pos, 0, 6)

                        ////binding Group create
                        const bindGroupLayout = device.createBindGroupLayout({
                            entries: [{
                                binding: 1,
                                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                                buffer: { type: "read-only-storage", hasDynamicOffset: false, minBindingSize: 0 }
                            },
                            ]
                        })

                        const bindGroup = device.createBindGroup({
                            layout: bindGroupLayout,
                            entries: [{
                                binding: 1,
                                resource: { buffer: ssboOutput }
                            }]
                        })
                        that.bindGroup = bindGroup

                        ////定義 BindingGroupLayout 供renderPipeline 使用
                        const pipeLineLayout = device.createPipelineLayout({
                            bindGroupLayouts: [bindGroupLayout]
                        })

                        ////建立 RenderPipeline
                        that.pipeline = device.createRenderPipeline({
                            vertex: {
                                module: device.createShaderModule({
                                    code: wgslVertex,
                                }),
                                entryPoint: 'main',
                            },
                            fragment: {
                                module: device.createShaderModule({
                                    code: wgslFragment,
                                }),
                                entryPoint: 'main',
                                targets: [{ format: "bgra8unorm" },
                                ],
                            },
                            primitive: { topology: 'triangle-list' },

                            layout: pipeLineLayout
                        });

                        that.render()
                    }
                });
            }
            reader.readAsArrayBuffer(file)
            return true;
        }).bind(this);

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        filesInput.reload = function () { };
        filesInput.monitorElementForDragNDrop(this.canvas);
        return scene;
    }

    checkComputeShadersSupported(engine: Engine, scene: Scene) {
        // engine.getCaps().supportComputeShaders
        const supportCS = engine.getCaps().supportComputeShaders;

        if (supportCS) {
            return true;
        }
        return false;
    }
    //    async initDevice() {
    //     if (!navigator.gpu) {
    //         throw new Error("navigator.gpu is null. Browser maybe not support or setting error, try use Chrome Canary.")
    //     }

    //     this.adapter != await navigator.gpu.requestAdapter({powerPreference:'high-performance',forceFallbackAdapter:true});
    //     if (this.adapter == null) {
    //         throw new Error("navigator.gpu.requestAdapter null. Browser maybe not support or setting error, try use Chrome Canary.");
    //     }
    //     return await this.adapter.requestDevice()
    // }

    render() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this
        console.log(this)
        const device = this.engineGPU._device
        const context = this.context

        const commandBuf: GPUCommandBuffer[] = gCommand()
        this.engineGPU._device.queue.submit(commandBuf)
        requestAnimationFrame(that.render.bind(that));

        function gCommand() {
            const commandEncoder = device.createCommandEncoder();
            const textureView = context.getCurrentTexture().createView();

            const colorAttachments: GPURenderPassColorAttachment[] = [
                {
                    view: textureView,
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ]
            const renderPassDescriptor: GPURenderPassDescriptor = {
                colorAttachments,
            };

            const ComputePassDescriptor: GPUComputePassDescriptor = {}

            const computePassEncoder = commandEncoder.beginComputePass(ComputePassDescriptor);
            computePassEncoder.setBindGroup(0, that.computeBindGroup);
            computePassEncoder.setPipeline(that.computePipeline);
            computePassEncoder.dispatchWorkgroups(511, 511, 104);

            computePassEncoder.end();



            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            if (that.pipeline != undefined) {
                console.log(that.pipeline)
                passEncoder.setPipeline(that.pipeline);

            }
            if (that.bindGroup != undefined) {
                console.log(that.bindGroup)
                passEncoder.setBindGroup(0, that.bindGroup)

            }
            passEncoder.draw(3, 1, 0, 0);
            passEncoder.end();
            return [commandEncoder.finish()]
        }
    }
}

function Normalize(pixelHU: Int16Array): void {
    let max = 0;
    let count = 0

    //const pixelOut: Uint8Array[] = []
    //find maxHU
    for (let i = 0; i < pixelHU.length; i++) {
        if (pixelHU[i] > max) {
            max = pixelHU[i]
            count++
        }
    }
    console.log(max)
    console.log("max 個數", count)
    const maxx = (max - 24) / 255
    for (let i = 0; i < pixelHU.length; i++) {
        pixelHU[i] = (pixelHU[i] - 24) / maxx
    }
    //console.log("normalizing", pixelHU)


    // const maxx = (max +2048)/255
    // for (let i = 0; i < pixelHU.length; i++) {
    //     pixelHU[i] = (pixelHU[i] + 2048) / maxx
    // }
}