import { Vector3 } from "@babylonjs/core";
import { Voxel } from "./myVoxel";


export class Mesh {

    //vertex: number[][] = [] //= new Array<number[]>(3);
    //vertex: Pt4[] = []
    vertex : Vector3[] = []
    // normal!: number[]// = new Array<number>(3);
    normal!: Vector3
    //color: number[] = new Array<number>(3);
    pushVertex(pt: Vector3) {
        this.vertex.push(pt)
    }
    updateNormalByVertexs(){
        const vertexs = this.vertex
        const edge1 = vertexs[1].subtract(vertexs[0])
        const edge2 = vertexs[2].subtract(vertexs[1])
        const normal = Vector3.Cross(edge1, edge2)
        normal.normalize()
        this.normal = normal
    }
}
export function gArray1<T>(cnt1: number, fn: () => T): T[] {
    const result: T[] = new Array<T>(cnt1)
    for (let j = 0; j < cnt1; j++) {
        result[j] = fn();
    }
    return result
}
export function gArray2<T>(cnt1: number, cnt2: number, fn: () => T): T[][] {
    const result: T[][] = new Array<Array<T>>(cnt1)
    for (let i = 0; i < cnt1; i++) {
        result[i] = new Array<T>(cnt2)
        for (let j = 0; j < cnt2; j++) {
            result[i][j] = fn();
        }
    }
    return result
}
