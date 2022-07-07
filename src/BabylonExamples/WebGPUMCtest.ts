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
import { getCsSource } from "./getCStest";
import { triTable } from "./triTable";


const AllDicomPixelData: Int16Array[] = []
//const AllDicomPixelData: Float32Array[] = []

const threshold = 150;
let gpuBuffer2: GPUBuffer
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
declare enum GPUTextureUsage {
    COPY_SRC = 0x01,
    COPY_DST = 0x02,
    TEXTURE_BINDING = 0x04,
    STORAGE_BINDING = 0x08,
    RENDER_ATTACHMENT = 0x10,
}

// eslint-disable-next-line prefer-const
let pixelSpace = 0;
let sliceThickness = 0;


export class WebGPUMCtest {

    scene!: Scene;
    engine!: Engine;
    engineGPU!: WebGPUEngine;

    adapter!: GPUAdapter;
    context!: GPUCanvasContext;
    pipeline!: GPURenderPipeline;
    computePipeline!: GPUComputePipeline;

    bindGroup!: GPUBindGroup;
    computeBindGroup!: GPUBindGroup;

    ssboOutput!: GPUBuffer;
    ssboOutput2!: GPUBuffer;
    ssboOutput3!: GPUBuffer;

    customMesh!: Mesh;



    constructor(private canvas: HTMLCanvasElement) {
        const engine = new WebGPUEngine(canvas);
        engine.initAsync().then(() => {
            this.engine = engine
            this.engineGPU = engine
            this.context = canvas.getContext("webgpu") as unknown as GPUCanvasContext
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
        camera.speed = 0.3;
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        // const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2, segments: 32 }, scene);
        // sphere.position.y = 1;
        // const ground = MeshBuilder.CreateGround("ground", { width: 6, height: 6 }, scene);

        if (!this.checkComputeShadersSupported(this.engine, scene)) {
            console.log("not support webgpu")
            return scene;
        }
        console.log("webgpu initgialed.")
        const MarchingMain = getCsSource();

        const wgslVertex = /* wgsl */`
        @group(0) @binding(1) var<storage, read> ssboOutput : array<f32>;
         @vertex
         fn main(@builtin(vertex_index) VertexIndex : u32)-> @builtin(position) vec4<f32> {
              var pos = array<vec2<f32>, 3>(
                  vec2<f32>(ssboOutput[0], ssboOutput[1]),
                  vec2<f32>(ssboOutput[2], ssboOutput[3]),
                  vec2<f32>(ssboOutput[4], ssboOutput[5]));
            
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

                    pixelSpace = Number(image?.pixelSpacing[0])
                    sliceThickness = Number(image?.sliceThickness) / 3 * 2

                    Normalize(buffer);
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

                        ////compute Shader Uniform 定義
                        const paramsBuffer = [threshold, pixelSpace, sliceThickness]
                        const paramsBufferArray = new Float32Array(paramsBuffer)

                        const uniformBuffer = device.createBuffer({
                            mappedAtCreation: false,
                            size: 3 * 4,
                            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        })

                        const triTableBuffer = device.createBuffer({
                            mappedAtCreation: false,
                            size: triTable.byteLength,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        })

                        device.queue.writeBuffer(
                            uniformBuffer, // 傳給
                            0,
                            paramsBufferArray, // Sourse ArrayBuffer
                            0
                        )

                        device.queue.writeBuffer(
                            triTableBuffer,
                            0,
                            triTable,
                            0
                        )

                        //const data = bufs;
                        //const data = new Float32Array([148, 145, 154, 153, 154, 153,143,157,148,196,143,153]);
                        // const data = new Float32Array([148, 145, 144, 143, 144, 143,143,147]);
                        const testData = [
                            new Float32Array([140, 141, 142, 143, 144, 145, 146, 147]),
                            new Float32Array([140, 151, 152, 153, 144, 155, 156, 157]),
                            new Float32Array([140, 141, 152, 153, 154, 155, 156, 157]),
                            new Float32Array([140, 141, 142, 143, 154, 155, 156, 157]),
                        ]
                        const data = testData[1];
                        const ssboInput = device.createBuffer({
                            mappedAtCreation: false,
                            size: data.byteLength,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                        });

                        ////data update
                        device.queue.writeBuffer(ssboInput, 0, data, 0)
                        console.log("input", data)

                        const ssboOutput = device.createBuffer({
                            mappedAtCreation: false,
                            size: 10666665 * 3 * 4,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                        });
                        const ssboOutput2 = device.createBuffer({
                            mappedAtCreation: false,
                            size: 10666665 * 3 * 4,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                        });
                        const ssboOutput3 = device.createBuffer({
                            mappedAtCreation: false,
                            size: 10666665 * 3 * 4,
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
                                },
                                {
                                    binding: 2,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "uniform" }
                                },
                                {
                                    binding: 3,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "read-only-storage" }
                                },
                                {
                                    binding: 4,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "storage" }
                                },
                                {
                                    binding: 5,
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
                                },
                                {
                                    binding: 2,
                                    resource: { buffer: uniformBuffer }
                                },
                                {
                                    binding: 3,
                                    resource: { buffer: triTableBuffer }
                                },
                                {
                                    binding: 4,
                                    resource: { buffer: ssboOutput2 }
                                },
                                {
                                    binding: 5,
                                    resource: { buffer: ssboOutput3 }
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
                                    code: MarchingMain
                                }),
                                entryPoint: "main"
                            },
                            layout: computePipeLineLayout
                        })

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
                        that.ssboOutput = ssboOutput
                        that.ssboOutput2 = ssboOutput2
                        that.ssboOutput3 = ssboOutput3

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
    render() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this
        const device = this.engineGPU._device
        const context = this.context

        const commandBuf: GPUCommandBuffer[] = gCommand()
        this.engineGPU._device.queue.submit(commandBuf)
        device.queue.onSubmittedWorkDone().then(() => {

            const gpuBuffer = gpuBuffer2
            gpuBuffer.mapAsync(0x0001, 0, 15 * 4 * 3).then(function () {
                const copyArrayBuffer = gpuBuffer.getMappedRange(0, 15 * 4 * 3);

                const data = new Uint8Array(15 * 4 * 3);
                data.set(new Uint8Array(copyArrayBuffer));
                gpuBuffer.unmap();
                const outputData = new Float32Array(data.buffer); // create the Float32Array for output
                gpuBuffer.destroy();

                console.log(outputData)

                that.customMesh = new Mesh("custom", that.scene);
                const meshs: number[] = []
                const indexs: number[] = []
                const normals: number[] = []

                let cntPoint = 0
                for (let i = 0; i < outputData.length; i += 3) {
                    if (outputData[i] > -9998) {
                        meshs.push(outputData[i]);
                        meshs.push(outputData[i + 1]);
                        meshs.push(outputData[i + 2]);
                        indexs.push(cntPoint);
                        cntPoint++;
                    }
                }
                console.log(meshs)

                VertexData.ComputeNormals(meshs, indexs, normals);
                const vertexData = new VertexData();

                vertexData.positions = meshs;
                vertexData.indices = indexs;//每三個點給定一個Index
                vertexData.normals = normals;

                vertexData.applyToMesh(that.customMesh);
                that.scene.defaultMaterial.backFaceCulling = false;
            })
        })

        //requestAnimationFrame(that.render.bind(that));

        function gCommand() {
            const commandEncoder = device.createCommandEncoder();
            const textureView = context.getCurrentTexture().createView();
            const textureViewDevice = device.createTexture({
                size: [that.canvas.width, that.canvas.height, 1],
                dimension: '2d',
                format: 'bgra8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
            }).createView();
            // const depthTexture = device.createTexture({
            //     size: [that.canvas.width, that.canvas.height, 1],
            //     dimension: '2d',
            //     format: 'depth24plus-stencil8',
            //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
            // });
            // const depthTextureView = depthTexture.createView();
            const colorAttachments: GPURenderPassColorAttachment[] = [
                {
                    view: textureView,
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ]
            // const depthStencilAttachment: GPURenderPassDepthStencilAttachment = {
            //     view: depthTextureView,
            //     depthClearValue: 1,
            //     depthStoreOp: 'store',
            //     depthLoadOp: "load",
            //     stencilClearValue: 0,
            //     stencilStoreOp: 'store',
            //     stencilLoadOp: 'load'
            // };

            const renderPassDescriptor: GPURenderPassDescriptor = {
                colorAttachments,
                //depthStencilAttachment
            };

            const ComputePassDescriptor: GPUComputePassDescriptor = {}

            const computePassEncoder = commandEncoder.beginComputePass(ComputePassDescriptor);
            computePassEncoder.setBindGroup(0, that.computeBindGroup);
            computePassEncoder.setPipeline(that.computePipeline);
            computePassEncoder.dispatchWorkgroups(1, 1, 1);
            computePassEncoder.end();

            gpuBuffer2 = device.createBuffer({
                mappedAtCreation: false,
                size: 15 * 4 * 3,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            })
            commandEncoder.copyBufferToBuffer(that.ssboOutput, 0, gpuBuffer2, 0, 15 * 4 * 3)
            //commandEncoder.copyBufferToBuffer(that.ssboOutput2, 10666665 * 4, gpuBuffer2, 0, 10666665 * 4)
            //commandEncoder.copyBufferToBuffer(that.ssboOutput3, 10666665 * 4 * 2, gpuBuffer2, 0, 10666665 * 4)

            //setTimeout(() => {
            //const device = that.engineGPU._device;
            // const gpuBuffer = device.createBuffer({
            //     mappedAtCreation: false,
            //     size: 10666665 * 4,
            //     usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            // })
            // commandEncoder.copyBufferToBuffer(that.ssboOutput, 0, gpuBuffer, 0, 10666665 * 4)

            // gpuBuffer.mapAsync(0x0001, 0, 10666665 * 4).then(function () {
            //     const copyArrayBuffer = gpuBuffer.getMappedRange(0, 10666665 * 4);

            //     const data = new Uint8Array(10666665 * 4);

            //     data.set(new Uint8Array(copyArrayBuffer));


            //     gpuBuffer.unmap();
            //     gpuBuffer.destroy();
            //     console.log(data)
            //     console.log(new Float32Array(data))
            // })

            // }, 5000);


            // commandEncoder.copyBufferToBuffer(that.ssboOutput, 0, that.ssboTemp, 0, 6 * 4)



            // const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            // if (that.pipeline != undefined) {
            //     console.log(that.pipeline)
            //     passEncoder.setPipeline(that.pipeline);

            // }
            // if (that.bindGroup != undefined) {
            //     console.log(that.bindGroup)
            //     passEncoder.setBindGroup(0, that.bindGroup)

            // }
            // passEncoder.draw(3 * 10666665, 1, 0, 0);
            // passEncoder.end();
            return [commandEncoder.finish()]
        }
    }
}

function Normalize(pixelHU: Int16Array): void {
    let max = 0;
    let count = 0
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