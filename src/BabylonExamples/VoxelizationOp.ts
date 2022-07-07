
import { gArray2 } from "./Mesh"
import { Voxel } from "./myVoxel"
import { Slice } from "./Slice"


export class VoxelizationOp {
    data!: Int16Array[]
    voxelTemp!: Voxel[][]
    voxels: Voxel[][] = []
    constructor() {
        this.intVoxelTempSize()
    }

    intVoxelTempSize() {
        this.voxelTemp = new Array<Voxel[]>(512);

        for (let i = 0; i < 512; i++) {
            this.voxelTemp[i] = new Array<Voxel>(512)
            for (let index = 0; index < 512; index++) {
                this.voxelTemp[i][index] = new Voxel()
            }
        }
    }
    
    upSlice !: Slice
    lowSlice !: Slice
    slicetemp !: Slice
    slope !: number
    intercept !: number
    main(data: Int16Array[], surfaceNumber: number[], threshold: number, slope:number, intercept:number) {
        this.data = data
        this.slope = slope
        this.intercept = intercept
        console.log("Creat Voxel Map Start")

        for (let i = 0; i < data.length; i++) {
            this.Normalize(data[i])
        }
        console.log("noemalize Done")

        this.upSlice = dataToSlice(data[0])
        this.lowSlice = dataToSlice(data[1])
        surfaceNumber[0] = this.SingleVoxelMap(0, this.upSlice, this.lowSlice, threshold)

        this.slicetemp = this.upSlice
        for (let layer = 1; layer < data.length; layer++) {
            this.upSlice = this.lowSlice
            this.lowSlice = this.slicetemp
            this.lowSlice = dataToSlice(data[layer])
            surfaceNumber[layer] = this.SingleVoxelMap(layer, this.upSlice, this.lowSlice, threshold)
            this.slicetemp = this.upSlice
        }

        console.log("Voxelization All Done")

        return this.voxels;
    }


    
    Normalize(pixelHU: Int16Array): void {
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
            pixelHU[i] = (pixelHU[i] * this.slope + this.intercept + 1000) / maxx
        }
        // const maxx = (max +2048)/255
        // for (let i = 0; i < pixelHU.length; i++) {
        //     pixelHU[i] = (pixelHU[i] + 2048) / maxx
        // }
    }

    SingleVoxelMap(layer: number, upSlice: Slice, lowSlice: Slice, threshold: number) {
        let surfaceNumber = 0
        const HU = [8]
        let isValid = false
        let AND = true
        let OR = false

        this.voxelTemp = gArray2(512, 512, () => new Voxel())

        for (let row = 0; row < 512 - 1; row++) {
            for (let col = 0; col < 512 - 1; col++) {
                this.voxelTemp[row][col].index[0] = row
                this.voxelTemp[row][col].index[1] = col
                this.voxelTemp[row][col].index[2] = layer

                HU[7] = upSlice.pixelHU[row][col]
                HU[6] = upSlice.pixelHU[row][col + 1]
                HU[2] = upSlice.pixelHU[row + 1][col + 1]
                HU[3] = upSlice.pixelHU[row + 1][col]
                HU[4] = lowSlice.pixelHU[row][col]
                HU[5] = lowSlice.pixelHU[row][col + 1]
                HU[1] = lowSlice.pixelHU[row + 1][col + 1]
                HU[0] = lowSlice.pixelHU[row + 1][col]

                for (let i = 0; i < 8; i++) {
                    if (HU[i] >= threshold) {
                        this.voxelTemp[row][col].flag[i] = true
                        isValid = true
                    }
                    else {
                        this.voxelTemp[row][col].flag[i] = false
                    }
                    if (isValid) {
                        AND = (this.voxelTemp[row][col].flag[0]
                            && this.voxelTemp[row][col].flag[1]
                            && this.voxelTemp[row][col].flag[2]
                            && this.voxelTemp[row][col].flag[3]
                            && this.voxelTemp[row][col].flag[4]
                            && this.voxelTemp[row][col].flag[5]
                            && this.voxelTemp[row][col].flag[6]
                            && this.voxelTemp[row][col].flag[7])

                        OR = (this.voxelTemp[row][col].flag[0]
                            || this.voxelTemp[row][col].flag[1]
                            || this.voxelTemp[row][col].flag[2]
                            || this.voxelTemp[row][col].flag[3]
                            || this.voxelTemp[row][col].flag[4]
                            || this.voxelTemp[row][col].flag[5]
                            || this.voxelTemp[row][col].flag[6]
                            || this.voxelTemp[row][col].flag[7])

                        if ((AND == false) && (OR == true)) {
                            this.voxelTemp[row][col].SurfaceDefine = true
                            surfaceNumber++
                        } else {
                            this.voxelTemp[row][col].SurfaceDefine = false
                        }
                    } else {
                        this.voxelTemp[row][col].SurfaceDefine = false
                    }
                    isValid = false
                }
            }

            //console.log("layer :", layer, "number of Surface Voxels =", surfaceNumber)
        }

        let count = 0
        const voxel: Voxel[] = [];
        for (let row = 0; row < 512 - 1; row++) {
            for (let col = 0; col < 512 - 1; col++) {
                if (this.voxelTemp[row][col].SurfaceDefine == true) {
                    voxel.push(this.voxelTemp[row][col])
                    count++
                }
            }
        }
        this.voxels.push(voxel)
        //console.log("layer :", layer, "number of Valid Voxels =", count)

        return count

    }
}
function dataToSlice(data: Int16Array): Slice {
    const sliceTemp = new Slice(512, 512)
    const hu = sliceTemp.pixelHU

    let row = 0
    let col = 0
    for (let i = 0; i < 512 * 512; i++) {
        col = i % 512
        row = (i - col) / 512
        hu[row][col] = data[i]
    }
    return sliceTemp
}

