import {
  Scene,
  Engine,
  FreeCamera,
  Vector3,
  FilesInput,
  Tools,
  Mesh,
  VertexData,
  ArcRotateCamera,
  DirectionalLight,
  HemisphericLight,
  UniversalCamera,
} from "@babylonjs/core";
import * as dicomjs from '../dicom_main'

//import { encode } from "punycode";
import { decoderForImage } from "@/dicom_main/decoder";
import { ImageSize } from "@/dicom_main/image/Types";
import { MarchingCube } from "./MarchingMain";
import { Voxel } from "./myVoxel";
import { VoxelizationOp } from "./VoxelizationOp";

const threshold = 160

const AllDicomPixelData: Int16Array[] = []
let SurfaceVoxels: Voxel[][]
const surfaceNumber: number[] = new Array(355)

// eslint-disable-next-line prefer-const
let pixelSpace = 0;
let sliceThickness = 0;
let slope = 1;
let intercept = 0;

export class DicomImage {
  scene: Scene;
  engine: Engine;
  customMesh!: Mesh;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(this.canvas, true);
    this.scene = this.CreateScene();
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

  }
  doWhenImageLoaded(img: Int16Array) {
    const context = (document.getElementById('Canvas2D')! as HTMLCanvasElement).getContext('2d');
    const imgd = context!.getImageData(0, 0, 512, 512);
    const pixel = imgd.data;

    for (let i = 0; i < img.length; i++) {
      const v = img[i + 512 * 128]
      pixel[4 * i] = v;
      pixel[4 * i + 1] = v;
      pixel[4 * i + 2] = v;
      pixel[4 * i + 3] = 255;
    }

    context!.putImageData(imgd, 0, 0);
  }
  ////初始化 Voxel
  intSurfaceVoxels() {
    SurfaceVoxels = new Array<Voxel[]>(AllDicomPixelData.length);
    for (let i = 0; i < AllDicomPixelData.length; i++) {
      SurfaceVoxels[i] = new Array<Voxel>()
    }
  }
  CreatVoxelMap() {
    const op1 = new VoxelizationOp();
    const voxels = op1.main(AllDicomPixelData, surfaceNumber, threshold, slope, intercept);
    SurfaceVoxels = voxels
    console.log("SurfaceVoxels 個數", voxels.length)
  }
  GetMarchingCubeMesh() {
    const op2 = new MarchingCube();
    const AllMeshNumber = op2.main(SurfaceVoxels, surfaceNumber, pixelSpace, sliceThickness)

    this.customMesh = new Mesh("custom", this.scene);
    const meshs = op2.meshs
    const positions: number[] = []
    const indexs: number[] = []
    const normals: number[] = []

    console.log(meshs.length)
    for (const mesh of meshs) {
      for (const pt of mesh.vertex) {
        positions.push(pt.x)
        positions.push(pt.y)
        positions.push(pt.z);
        indexs.push(indexs.length)
      }
    }
    VertexData.ComputeNormals(positions, indexs, normals);
    const vertexData = new VertexData();

    vertexData.positions = positions;
    vertexData.indices = indexs;//每三個點給定一個Index
    vertexData.normals = normals;

   
    
    vertexData.applyToMesh(this.customMesh);
    this.scene.defaultMaterial.backFaceCulling = false;
    //console.log(this.customMesh)


  }
  /////////// 初始化Scene
  CreateScene(): Scene {

    const scene = new Scene(this.engine);

    const camera = new UniversalCamera("UniversalCamera", new Vector3(0, 0, -10), scene);
    const light = new DirectionalLight("hemi", new Vector3(500, 500, 500), scene);

    const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.5;

    camera.setTarget(new Vector3(250, 250, 0));
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    camera.attachControl(this.engine.getRenderingCanvas());
    scene.activeCamera = camera;
    //camera.attachControl(this.canvas);
    camera.speed = 1.5;

    

    // /////// Dicom 讀檔解譯
    const filesInput = new FilesInput(this.engine, scene, null, null, null, null, function () {
      Tools.ClearLogCache()
    }, null, null);

    filesInput.onProcessFileCallback = (function (file: File, name: string, extension: string) {
      console.log("done: " + (typeof file) + " " + name + " " + extension);
      const reader = new FileReader()
      ////當檔案讀取時
      reader.onload = (_ev) => {
        ////Parse Dicom File
        const image = dicomjs.parseImage(new DataView(reader.result as ArrayBuffer))
        const decoder = decoderForImage(image!);
        decoder!.outputSize = new ImageSize(image!);
        const imageInfo = decoder?.image;
        const pixelDataPromise = decoder!.getFrame2() // promise<>

        pixelDataPromise.then(pixelData => {
          
          ////取得必要Dicom資訊
          const buffer = new Int16Array(pixelData?.buffer, pixelData.byteOffset, pixelData.byteLength / 2);
          AllDicomPixelData.push(buffer);
          pixelSpace = Number(image?.pixelSpacing[0])
          sliceThickness = Number(image?.sliceThickness) / 3 * 2
          slope = Number(image?.dataScaleSlope)
          intercept = Number(image?.dataScaleIntercept)
          console.log("sliceThickness :", sliceThickness )
          console.log("slope :", slope )
          console.log("intercept :", intercept )
          if (AllDicomPixelData.length == 330) {
            that.intSurfaceVoxels()
            that.CreatVoxelMap()
            that.GetMarchingCubeMesh()
            //that.doWhenImageLoaded(AllDicomPixelData[0])
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
}

