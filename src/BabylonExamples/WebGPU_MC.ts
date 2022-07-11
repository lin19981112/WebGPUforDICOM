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
import { sizeOneSSbo, threshold } from "./globalVariables";

import Enumerable from "linq";

const AllDicomPixelData: Int16Array[] = []

let gpuBuffer2: GPUBuffer
let gpuBuffer3: GPUBuffer
const dataOutputCPU: number[][] = []
let dataOutputCPUArray: ArrayBuffer
//let SurfaceVoxels: Voxel[][]

//const surfaceNumber: number[] = new Array(105)

export class DeviceSigleton {
    private _device?: GPUDevice
    static s: DeviceSigleton = new DeviceSigleton();
    setDevice(a1: GPUDevice) {
        this._device = a1
    }
    getDevice() {
        if (this._device == null) {
            throw Error('assert device not null.')
        }
        return this._device
    }
}


//let data = new ArrayBuffer(512 * 512 * 6 * 4)
const datas = gArrayBuffers(105);

function gArrayBuffers(cntLevel: number) {
    const cnt2 = Math.ceil(cntLevel / 6);
    return Enumerable.range(0, cnt2)
        .select(_a1 => new ArrayBuffer(512 * 512 * 6 * 4))
        .toArray();
}
function gSSboBuffers(count: number) {
    return Enumerable.range(0, count)
        .select(i => createSSboInputs(i))
        .toArray();


    function createSSboInputs(i: number) {
        const device = DeviceSigleton.s.getDevice();
        return device.createBuffer({
            mappedAtCreation: false,
            size: datas[i].byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
    }
}
function gBindGroup(
    count: number,
    computeBindGroupLayout: GPUBindGroupLayout,
    ssboInputs: GPUBuffer[],
    ssboOutput: GPUBuffer,
    uniformBuffer: GPUBuffer,
    triTableBuffer: GPUBuffer,
    ssboOutput2: GPUBuffer,
    ssboOutput3: GPUBuffer,
    ssboOutput4: GPUBuffer,
    ssboOutput5: GPUBuffer,
    ssboOutput6: GPUBuffer) {
    return Enumerable.range(0, count)
        .select(i => createBindGroups(i))
        .toArray();
    function createBindGroups(i: number) {
        const device = DeviceSigleton.s.getDevice();
        return device.createBindGroup({
            layout: computeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: ssboInputs[i] }
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
    }
}
declare enum GPUShaderStage {

    VERTEX = 0x1,
    FRAGMENT = 0x2,
    COMPUTE = 0x4
}
declare enum GPUBufferUsage {
    MAP_READ = 0x0001,      // 映射並用來獨取
    MAP_WRITE = 0x0002,     // 映射並用來寫入
    COPY_SRC = 0x0004,      // 可以作為拷貝源
    COPY_DST = 0x0008,      // 可以作為拷貝目標
    INDEX = 0x0010,         // 索引緩存
    VERTEX = 0x0020,        // 頂點緩存
    UNIFORM = 0x0040,       // Uniform 緩存
    STORAGE = 0x0080,       // 僅存儲型緩存
    INDIRECT = 0x0100,      // 間接使用
    QUERY_RESOLVE = 0x0200  // 用於查詢
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
    computeBindGroups!: GPUBindGroup[];

    ssboOutput!: GPUBuffer;
    ssboOutput2!: GPUBuffer;
    ssboOutput3!: GPUBuffer;
    ssboOutput4!: GPUBuffer;
    ssboOutput5!: GPUBuffer;
    ssboOutput6!: GPUBuffer;

    //customMesh!: Mesh;
    constructor(private canvas: HTMLCanvasElement) {
        const engine = new WebGPUEngine(canvas);
        engine.initAsync().then(() => {
            this.engine = engine
            this.engineGPU = engine
            DeviceSigleton.s.setDevice(engine._device);
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

        scene.defaultMaterial.backFaceCulling = false;
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
                    const device = that.engineGPU._device   ////device = GPUDevice
                    const buffer = new Int16Array(pixelData?.buffer, pixelData.byteOffset, pixelData.byteLength / 2);
                    pixelSpace = Number(image?.pixelSpacing[0])
                    sliceThickness = Number(image?.sliceThickness)
                    Normalize(buffer);
                    AllDicomPixelData.push(buffer);
                    function devideAllDataToSingleBuf(dataNumber: number) {
                        const buf = new ArrayBuffer(512 * 512 * 128 * 4)
                        for (let i = 0; i < 6; i++) {
                            let dataCount = dataNumber * 6 + i
                            if (dataCount > 104) {
                                dataCount = 104;
                            }
                            const a1 = AllDicomPixelData[dataCount];
                            const dst1 = new DataView(buf, 512 * 512 * i * 4, 512 * 512 * 4)
                            for (let j = 0; j < a1.length; j++) {
                                const a2 = a1[j];
                                dst1.setFloat32(j * 4, a2, true);
                            }
                        }
                        return buf;
                    }

                    if (AllDicomPixelData.length == 105) {
                        for (let i = 0; i < Math.ceil(105 / 6); i++) {////分割dicom data
                            datas[i] = devideAllDataToSingleBuf(i);
                        }

                        //console.log("bufs float32 array", new Float32Array(data));
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
                        device.queue.writeBuffer(////uniform Params
                            uniformBuffer, // 傳給
                            0,
                            paramsBufferArray, // Sourse ArrayBuffer
                            0
                        )
                        device.queue.writeBuffer(////uniform triTable
                            triTableBuffer,
                            0,
                            triTable,
                            0
                        )

                        const ssboInputs = gSSboBuffers(datas.length);
                        for (let i = 0; i < datas.length; i++) {////寫入所有data至對應ssboinput
                            device.queue.writeBuffer(ssboInputs[i], 0, datas[i], 0);
                        }





                        //data update
                        //console.log("input", datas[0])

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

                        const computeBindGroups = gBindGroup(datas.length, computeBindGroupLayout, ssboInputs, ssboOutput, uniformBuffer, triTableBuffer, ssboOutput2, ssboOutput3, ssboOutput4, ssboOutput5, ssboOutput6);

                        that.computeBindGroups = computeBindGroups;

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
                        that.bindGroup = bindGroup//// vertex binding Group
                        that.ssboOutput = ssboOutput
                        that.ssboOutput2 = ssboOutput2
                        that.ssboOutput3 = ssboOutput3
                        that.ssboOutput4 = ssboOutput4
                        that.ssboOutput5 = ssboOutput5
                        that.ssboOutput6 = ssboOutput6

                        const vbo = device.createBuffer({
                            size: dataOutputCPU.length * 4,
                            usage: GPUBufferUsage.VERTEX,
                            mappedAtCreation: false
                        })

                        //new Float32Array(vbo.getMappedRange()).set(dataOutputCPU)

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
                        that.render();
                    }
                    return;// promise then
                }); // promise then
            }
            reader.readAsArrayBuffer(file)
            return true;
        }).bind(this);
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        filesInput.reload = function () { };
        filesInput.monitorElementForDragNDrop(this.canvas);
        return scene;
    }


    render() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this
        const device = this.engineGPU._device
        const context = this.context
        //const time = new Date();
        const idxMaxStop = Math.ceil(105 / 6); // 17.xxxx => 18

        const customMesh = new Mesh("custom", that.scene);
        //const dataOutputCPU: Float32Array[] = []


        doOneSub(0)

        // for (let i = 0; i < dataOutputCPU.length; i++) {
        //     const buf = new ArrayBuffer(dataOutputCPU[i].length);
        //     const dst = new DataView(buf, dataOutputCPU[i].length);
        //     const a = dataOutputCPU[i];
        //     for (let j = 0; j < a.length; j++) {
        //         const a1 = a[j]
        //         dst.setFloat32(j * 4, a1, true);
        //     }
        //     dataOutputCPUArray = buf
        // }
        

        function doOneSub(idx: number) {
            console.log(idx);
            if (idx >= 2) {
                for (let i = 0; i < dataOutputCPU.length; i++) {
                    //console.log(dataOutputCPU[idx].length)
                    gCutomMesh(dataOutputCPU[i], i, customMesh)
                }
                return;
            }
            const commandBuf: GPUCommandBuffer[] = gCommand(idx)
           

            device.queue.onSubmittedWorkDone().then(async () => {
                
                dataOutputCPU.push(await mapAndPushDataToMeshesAsync(gpuBuffer2))
                dataOutputCPU.push(await mapAndPushDataToMeshesAsync(gpuBuffer3))
                
                doOneSub(idx + 1);
            })
            device.queue.submit(commandBuf)
        }
        function gCutomMesh(outputData: number[], idx: number, customMesh: Mesh) {
            // const customMesh = new Mesh("custom"+idx, that.scene);
            const meshs: number[] = []
            const indexs: number[] = []
            const normals: number[] = []
            let cntPoint = 0 
            let time = new Date();
            time = new Date();
            pushDataToMeshs(outputData)
            myBabylonDrawMeshes()
            console.log("time dataCPU to babylon Mesh Drawing:", new Date().getTime() - time.getTime());
            return;

            function pushDataToMeshs(outputData: number[]) {
                for (let i = 0; i < outputData.length; i += 3) {
                    if (outputData[i] > -9998) {
                        meshs.push(outputData[i]);
                        meshs.push(outputData[i + 1]);
                        meshs.push(outputData[i + 2]);
                        indexs.push(cntPoint);
                        cntPoint++;
                    }
                }
            }

            function myBabylonDrawMeshes() {
                VertexData.ComputeNormals(meshs, indexs, normals);
                const vertexData = new VertexData();

                vertexData.positions = meshs;
                vertexData.indices = indexs;//每三個點給定一個Index
                vertexData.normals = normals;
                vertexData.applyToMesh(customMesh);

                vertexData.positions = [];
                vertexData.indices = [];
                vertexData.normals = [];
                //console.log(customMesh)
            }
        }
        // that.customMesh = new Mesh("custom", that.scene);
        // const meshs: number[] = []
        // const indexs: number[] = []
        // const normals: number[] = []
        // let cntPoint = 0

        // function pushDataToMeshs(outputData: Float32Array) {
        //     for (let i = 0; i < outputData.length; i += 3) {
        //         if (outputData[i] > -9998) {
        //             meshs.push(outputData[i]);
        //             meshs.push(outputData[i + 1]);
        //             meshs.push(outputData[i + 2]);
        //             indexs.push(cntPoint);
        //             cntPoint++;
        //         }
        //     }
        // }

        // function myBabylonDrawMeshes() {
        //     VertexData.ComputeNormals(meshs, indexs, normals);
        //     const vertexData = new VertexData();

        //     vertexData.positions = meshs;
        //     vertexData.indices = indexs;//每三個點給定一個Index
        //     vertexData.normals = normals;

        //     vertexData.applyToMesh(that.customMesh);
        //     console.log("time:", new Date().getTime() - time.getTime());
        //     that.scene.defaultMaterial.backFaceCulling = false;
        // }
        async function mapAndPushDataToMeshesAsync(gpuBuffer: GPUBuffer) {
            await gpuBuffer.mapAsync(0x0001, 0, sizeOneSSbo * 3);
            const copyArrayBuffer = gpuBuffer.getMappedRange(0, sizeOneSSbo * 3);
            const data = new Uint8Array(sizeOneSSbo * 3);
            data.set(new Uint8Array(copyArrayBuffer));
            gpuBuffer.unmap();
            gpuBuffer.destroy();

            //return new Float32Array(data.buffer); // create the Float32Array for output
            return Enumerable.from(new Float32Array(data.buffer)).where(a1 => a1 > -9998).toArray(); // create the Float32Array for output
        }
        //for (let i = 0; i < 18; i++) {
        // const commandBuf: GPUCommandBuffer[] = gCommand(0)
        // console.log("time:", new Date().getTime() - time.getTime());
        // device.queue.onSubmittedWorkDone().then(doWhenSubmitted)
        // async function doWhenSubmitted() {
        //     console.log("done")

        //     const gpuBuffert1 = gpuBuffer2
        //     const gpuBuffert2 = gpuBuffer3
        //     that.customMesh = new Mesh("custom", that.scene);
        //     const meshs: number[] = []
        //     const indexs: number[] = []
        //     const normals: number[] = []
        //     let cntPoint = 0

        //     await mapAndPushDataToMeshesAsync(gpuBuffert1)
        //     await mapAndPushDataToMeshesAsync(gpuBuffert2)

        //     //console.log("time:", new Date().getTime() - time.getTime());
        //     // const tasks = [
        //     //     mapAndPushDataToMeshesAsync(gpuBuffert1),
        //     //     mapAndPushDataToMeshesAsync(gpuBuffert2)
        //     // ]
        //     // await Promise.all(tasks);
        //     //myBabylonDrawMeshes();

        //     async function mapAndPushDataToMeshesAsync(gpuBuffer: GPUBuffer) {
        //         await gpuBuffer.mapAsync(0x0001, 0, sizeOneSSbo * 3).then(function () {
        //             const outputData = gpuBufferToFloat32Array(gpuBuffer);
        //             console.log(outputData);
        //             pushDataToMeshs(outputData);
        //         })
        //         await delay(5000);
        //     }
        //     function gpuBufferToFloat32Array(gpuBuffert1: GPUBuffer) {
        //         const copyArrayBuffer = gpuBuffert1.getMappedRange(0, sizeOneSSbo * 3);
        //         const data = new Uint8Array(sizeOneSSbo * 3);
        //         data.set(new Uint8Array(copyArrayBuffer));
        //         gpuBuffert1.unmap();
        //         gpuBuffert1.destroy();
        //         return new Float32Array(data.buffer); // create the Float32Array for output
        //     }

        // function pushDataToMeshs(outputData: Float32Array) {
        //     for (let i = 0; i < outputData.length; i += 3) {
        //         if (outputData[i] > -9998) {
        //             meshs.push(outputData[i]);
        //             meshs.push(outputData[i + 1]);
        //             meshs.push(outputData[i + 2]);
        //             indexs.push(cntPoint);
        //             cntPoint++;
        //         }
        //     }
        // }

        // function myBabylonDrawMeshes() {
        //     VertexData.ComputeNormals(meshs, indexs, normals);
        //     const vertexData = new VertexData();

        //     vertexData.positions = meshs;
        //     vertexData.indices = indexs;//每三個點給定一個Index
        //     vertexData.normals = normals;

        //     vertexData.applyToMesh(that.customMesh);
        //     console.log("time:", new Date().getTime() - time.getTime());
        //     that.scene.defaultMaterial.backFaceCulling = false;
        // }
        // }
        // this.engineGPU._device.queue.submit(commandBuf)
        // //}


        //requestAnimationFrame(that.render.bind(that));

        function gCommand(numberOfCommand: number) {
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
            //console.log(that.computeBindGroup)
            computePassEncoder.setBindGroup(0, that.computeBindGroups[numberOfCommand]);
            computePassEncoder.setPipeline(that.computePipeline);
            computePassEncoder.dispatchWorkgroups(511, 511, 5);
            computePassEncoder.end();

            gpuBuffer2 = gBufferForCopy();
            gpuBuffer3 = gBufferForCopy();
            bindSSboOutputToBufferOfCanMap(gpuBuffer2, [that.ssboOutput, that.ssboOutput2, that.ssboOutput3])
            bindSSboOutputToBufferOfCanMap(gpuBuffer3, [that.ssboOutput4, that.ssboOutput5, that.ssboOutput6])

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

            function gBufferForCopy() {
                return device.createBuffer({
                    mappedAtCreation: false,
                    size: sizeOneSSbo * 3,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                })
            }
            function bindSSboOutputToBufferOfCanMap(gpuBuffer: GPUBuffer, ssboOutputs: GPUBuffer[]) {
                commandEncoder.copyBufferToBuffer(ssboOutputs[0], 0, gpuBuffer, 0, sizeOneSSbo)
                commandEncoder.copyBufferToBuffer(ssboOutputs[1], sizeOneSSbo, gpuBuffer, 0, sizeOneSSbo)
                commandEncoder.copyBufferToBuffer(ssboOutputs[2], sizeOneSSbo * 2, gpuBuffer, 0, sizeOneSSbo)
            }
        }
    }
    checkComputeShadersSupported(engine: Engine, scene: Scene) {
        // engine.getCaps().supportComputeShaders
        const supportCS = engine.getCaps().supportComputeShaders;
        if (supportCS) {
            return true;
        }
        return false;
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
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}