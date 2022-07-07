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
import { getCsSource } from "./getCS";
import { triTable } from "./triTable";


const AllDicomPixelData: Int16Array[] = []
//const AllDicomPixelData: Float32Array[] = []

const threshold = 150;
let gpuBuffer2: GPUBuffer
let gpuBuffer3: GPUBuffer
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


export class WebGPU_MC {

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
    ssboOutput4!: GPUBuffer;
    ssboOutput5!: GPUBuffer;
    ssboOutput6!: GPUBuffer;

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

        const scene = new Scene(this.engine);
        const camera = new FreeCamera("camera", new Vector3(250, -10, -10), this.scene);
        camera.setTarget(new Vector3(250, 250, 50));
        camera.attachControl();
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
        //     //////Computer ShaderCompute//
        //     const addVector =  /* wgsl */ `
        //     struct Params {
        //         threshold:f32,
        //         pixelSpace:f32,
        //         sliceThickness:f32,
        //     };
        //         @group(0) @binding(0) var<storage, read_write> data : array<f32>;
        //         @group(0) @binding(1) var<storage, write> ssboOutput : array<f32>;
        //         @group(0) @binding(2) var<uniform> params : Params;
        //         @compute @workgroup_size(1,1,1)

        //     fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        //         let idx = global_id.x + global_id.y*512 + global_id.z*512*512;

        //         // ssboOutput[idx] = data[idx] - 0.5 + params.pixelSpace;
        //         ssboOutput[idx] = data[idx] - 0.5 + params.pixelSpace + 0.1;
        //         if (global_id.x >= 511 || global_id.y >= 511 || global_id.z >= 104) {
        //             return;
        //         }

        //         var index = global_id;

        //         var voxelData:array<f32, 8>;
        //         voxelData[0] = data[globe3DTo1DIndex(index.x, index.y, index.z)];
        //         voxelData[1] = data[globe3DTo1DIndex(index.x + 1, index.y, index.z)];
        //         voxelData[2] = data[globe3DTo1DIndex(index.x + 1, index.y + 1, index.z)];
        //         voxelData[3] = data[globe3DTo1DIndex(index.x, index.y + 1, index.z)];
        //         voxelData[4] = data[globe3DTo1DIndex(index.x, index.y, index.z + 1)];
        //         voxelData[5] = data[globe3DTo1DIndex(index.x + 1, index.y, index.z + 1)];
        //         voxelData[6] = data[globe3DTo1DIndex(index.x + 1, index.y + 1, index.z + 1)];
        //         voxelData[7] = data[globe3DTo1DIndex(index.x, index.y + 1, index.z + 1)];

        //         var triangleIndex = 0;
        //         for (var i: u32 = 0; i < 8; i++) {
        //             if (voxelData[i] > params.threshold) {
        //                 triangleIndex |= 1 << i;
        //             }
        //         }

        //         //var vertex: array<vec3<f32>, 12>;
        //         // for (var i: i32 = 0; i < 12; i++) {
        //         //    vertex[i] = vec3(0,0,0);
        //         // }

        //         var vertex = createVertexs(global_id, voxelData);







        //         //var vector2 = array<f32, 6>(0.0, 0.5, -0.5, -0.5, 0.5, -0.5);
        //         //ssboOutput[idx] = data[idx] + params.sliceThickness + globe3DTo1DIndex(global_id.x, global_id.y, global_id.z);
        //     }

        //     fn aa()->vec3<f32>{
        //         return vec3(1,2,3);
        //     }

        //     fn globe3DTo1DIndex(globalx: u32, globaly: u32, globalz: u32) -> i32{
        //         return i32(globalx + globaly * 511 + globalz * 511 * 105);
        //     }

        //     fn createVertexs(voxelIndex: vec3<u32>, voxelData: array<f32, 8>) ->  array<vec3<f32>, 12>{
        //         var x = f32(voxelIndex.x) * params.pixelSpace;
        //         var y = f32(voxelIndex.y) * params.pixelSpace;
        //         var z = f32(voxelIndex.z) * params.pixelSpace;
        //         var c0 = vec3(x, y, z);
        //         var c1 = vec3(x + params.pixelSpace, y, z);
        //         var c2 = vec3(x + params.pixelSpace, y + params.pixelSpace, z);
        //         var c3 = vec3(x, y + params.pixelSpace, z);
        //         var c4 = vec3(x, y, z + params.pixelSpace);
        //         var c5 = vec3(x + params.pixelSpace, y, z + params.pixelSpace);
        //         var c6 = vec3(x + params.pixelSpace, y + params.pixelSpace, z + params.pixelSpace);
        //         var c7 = vec3(x, y + params.pixelSpace, z + params.pixelSpace);

        //         var pos: array<vec3<f32>, 12>;
        //         pos[0] = createVertex(c0, c1, voxelData[0], voxelData[1]);
        //         pos[1] = createVertex(c1, c2, voxelData[1], voxelData[2]);
        //         pos[2] = createVertex(c2, c3, voxelData[2], voxelData[3]);
        //         pos[3] = createVertex(c3, c0, voxelData[3], voxelData[0]);
        //         pos[4] = createVertex(c4, c5, voxelData[4], voxelData[5]);
        //         pos[5] = createVertex(c5, c6, voxelData[5], voxelData[6]);
        //         pos[6] = createVertex(c6, c7, voxelData[6], voxelData[7]);
        //         pos[7] = createVertex(c7, c4, voxelData[7], voxelData[4]);
        //         pos[8] = createVertex(c0, c4, voxelData[0], voxelData[4]);
        //         pos[9] = createVertex(c1, c5, voxelData[1], voxelData[5]);
        //         pos[10] = createVertex(c2, c6, voxelData[2], voxelData[6]);
        //         pos[11] = createVertex(c3, c7, voxelData[3], voxelData[7]);
        //         return pos;
        //     }

        //     fn createVertex(p0: vec3<f32>, p1: vec3<f32>, d0: f32, d1: f32) -> vec3<f32>{
        //         var diff = d1 - d0;
        //         if (abs(diff) > 0.00000001) {
        //             return (p1 - p0) * (params.threshold - d0) / diff + p0;
        //         } else {
        //             return (p0 + p1) * 0.5;
        //         }
        //     }

        // `;

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
            //console.log("done: " + (typeof file) + " " + name + " " + extension);
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
                    sliceThickness = Number(image?.sliceThickness)
                    Normalize(buffer);
                    AllDicomPixelData.push(buffer);

                    if (AllDicomPixelData.length == 6) {
                        for (let i = 0; i < AllDicomPixelData.length; i++) {
                            const a1 = AllDicomPixelData[i];
                            const dst1 = new DataView(bufs, 512 * 512 * i * 4, 512 * 512 * 4)

                            for (let j = 0; j < a1.length; j++) {
                                const a2 = a1[j];
                                dst1.setFloat32(j * 4, a2, true);
                            }
                        }
                        //console.log("bufs float32 array", new Float32Array(bufs));

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

                        const data = bufs;

                        const ssboInput = device.createBuffer({
                            mappedAtCreation: false,
                            size: data.byteLength,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                        });
                        ////data update
                        device.queue.writeBuffer(ssboInput, 0, data, 0)
                        //console.log("input", data)

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
                        const ssboOutput4 = device.createBuffer({
                            mappedAtCreation: false,
                            size: 10666665 * 3 * 4,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                        });
                        const ssboOutput5 = device.createBuffer({
                            mappedAtCreation: false,
                            size: 10666665 * 3 * 4,
                            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
                        });
                        const ssboOutput6 = device.createBuffer({
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
                                },
                                {
                                    binding: 6,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "storage" }
                                },
                                {
                                    binding: 7,
                                    visibility: GPUShaderStage.COMPUTE,
                                    buffer: { type: "storage" }
                                },
                                {
                                    binding: 8,
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
                                },
                                {
                                    binding: 6,
                                    resource: { buffer: ssboOutput4 }
                                },
                                {
                                    binding: 7,
                                    resource: { buffer: ssboOutput5 }
                                },
                                {
                                    binding: 8,
                                    resource: { buffer: ssboOutput6 }
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
                        that.ssboOutput4 = ssboOutput4
                        that.ssboOutput5 = ssboOutput5
                        that.ssboOutput6 = ssboOutput6

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
        // commandBuf.push(gCommand()[0])
        const time = new Date();

        console.log("time:", new Date().getTime() - time.getTime());
        this.engineGPU._device.queue.submit(commandBuf)
        device.queue.onSubmittedWorkDone().then(() => {
            const gpuBuffert1 = gpuBuffer2
            const gpuBuffert2 = gpuBuffer3
            that.customMesh = new Mesh("custom", that.scene);
            const meshs: number[] = []
            const indexs: number[] = []
            const normals: number[] = []
            let cntPoint = 0

            gpuBuffert1.mapAsync(0x0001, 0, 10666665 * 4 * 3).then(function () {
                const copyArrayBuffer = gpuBuffert1.getMappedRange(0, 10666665 * 4 * 3);

                const data = new Uint8Array(10666665 * 4 * 3);
                data.set(new Uint8Array(copyArrayBuffer));
                gpuBuffert1.unmap();
                const outputData = new Float32Array(data.buffer); // create the Float32Array for output
                gpuBuffert1.destroy();
                //console.log(outputData)

                // that.customMesh = new Mesh("custom", that.scene);
                // const meshs: number[] = []
                // const indexs: number[] = []
                // const normals: number[] = []

               
                for (let i = 0; i < outputData.length; i += 3) {
                    if (outputData[i] > -9998) {
                        meshs.push(outputData[i]);
                        meshs.push(outputData[i + 1]);
                        meshs.push(outputData[i + 2]);
                        indexs.push(cntPoint);
                        cntPoint++;
                    }
                }
                //console.log(meshs)
                // VertexData.ComputeNormals(meshs, indexs, normals);
                // const vertexData = new VertexData();

                // vertexData.positions = meshs;
                // vertexData.indices = indexs;//每三個點給定一個Index
                // vertexData.normals = normals;

                // vertexData.applyToMesh(that.customMesh);
                 console.log("time:", new Date().getTime() - time.getTime());
                // that.scene.defaultMaterial.backFaceCulling = false;
            })

            gpuBuffert2.mapAsync(0x0001, 0, 10666665 * 4 * 3).then(function () {
                const copyArrayBuffer2 = gpuBuffert2.getMappedRange(0, 10666665 * 4 * 3);

                const data = new Uint8Array(10666665 * 4 * 3);
                data.set(new Uint8Array(copyArrayBuffer2));
                gpuBuffert2.unmap();
                const outputData2 = new Float32Array(data.buffer); // create the Float32Array for output
                gpuBuffert2.destroy();

                for (let i = 0; i < outputData2.length; i += 3) {
                    if (outputData2[i] > -9998) {
                        meshs.push(outputData2[i]);
                        meshs.push(outputData2[i + 1]);
                        meshs.push(outputData2[i + 2]);
                        indexs.push(cntPoint);
                        cntPoint++;
                    }
                }

                console.log(indexs.length)


                VertexData.ComputeNormals(meshs, indexs, normals);
                const vertexData = new VertexData();

                vertexData.positions = meshs;
                vertexData.indices = indexs;//每三個點給定一個Index
                vertexData.normals = normals;

                vertexData.applyToMesh(that.customMesh);
                console.log("time:", new Date().getTime() - time.getTime());
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
            computePassEncoder.dispatchWorkgroups(511, 511, 104);
            computePassEncoder.end();


            gpuBuffer2 = gBufferForCopy();
            gpuBuffer3 = gBufferForCopy();
            bindSSboOutputToBufferOfCanMap(gpuBuffer2, [that.ssboOutput,that.ssboOutput2,that.ssboOutput3])
            bindSSboOutputToBufferOfCanMap(gpuBuffer3, [that.ssboOutput4,that.ssboOutput5,that.ssboOutput6])

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
            function gBufferForCopy(){
                return device.createBuffer({
                    mappedAtCreation: false,
                    size: 10666665 * 4 * 3,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                })
            }
            function bindSSboOutputToBufferOfCanMap(gpuBuffer:GPUBuffer,ssboOutputs: GPUBuffer[]){
                commandEncoder.copyBufferToBuffer(ssboOutputs[0], 0, gpuBuffer, 0, 10666665 * 4)
                commandEncoder.copyBufferToBuffer(ssboOutputs[1], 10666665 * 4, gpuBuffer, 0, 10666665 * 4)
                commandEncoder.copyBufferToBuffer(ssboOutputs[2], 10666665 * 4 * 2, gpuBuffer, 0, 10666665 * 4)
            }
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