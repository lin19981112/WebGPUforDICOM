export function getCsSource() {
    return computeMC();
}

//Computer ShaderCompute//
function computeMC() {
    return  /* wgsl */ `
    struct Params {
        threshold:f32,
        pixelSpace:f32,
        sliceThickness:f32,
    };
    let seg = 10666665;
    let dimX: u32 = 512;
    let dimY: u32 = 512;
    let dimZ: u32 = 6;
    
    @group(0) @binding(0) var<storage, read_write> data : array<f32>;
    @group(0) @binding(2) var<uniform> params : Params;
    @group(0) @binding(3) var<storage> triTable: array<i32>;
    @group(0) @binding(1) var<storage, write> ssboOutput : array<f32>;
    @group(0) @binding(4) var<storage, write> ssboOutput2 : array<f32>;
    @group(0) @binding(5) var<storage, write> ssboOutput3 : array<f32>;
    @group(0) @binding(6) var<storage, write> ssboOutput4 : array<f32>;
    @group(0) @binding(7) var<storage, write> ssboOutput5 : array<f32>;
    @group(0) @binding(8) var<storage, write> ssboOutput6 : array<f32>;
    @compute @workgroup_size(1,1,1)
    
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        //let idx = global_id.x + global_id.y * 511 + global_id.z * 511 * 8;
        var index = global_id;
        // ssboOutput[idx] = data[idx] - 0.5 + params.pixelSpace;
        // ssboOutput[idx] = data[idx] - 0.5 + params.pixelSpace;
        //ssboOutput[3 * idx] = params.sliceThickness ;
        //return;
        //return;
        if (global_id.x > (dimX - 1) || global_id.y > (dimY - 1) || global_id.z > (dimZ - 1)) {
            return;
        }

        
        var voxelData: array<f32, 8>;
        voxelData[0] = data[globe3DTo1DIndex(index.x, index.y, index.z)];
        voxelData[1] = data[globe3DTo1DIndex(index.x + 1, index.y, index.z)];
        voxelData[2] = data[globe3DTo1DIndex(index.x + 1, index.y + 1, index.z)];
        voxelData[3] = data[globe3DTo1DIndex(index.x, index.y + 1, index.z)];
        voxelData[4] = data[globe3DTo1DIndex(index.x, index.y, index.z + 1)];
        voxelData[5] = data[globe3DTo1DIndex(index.x + 1, index.y, index.z + 1)];
        voxelData[6] = data[globe3DTo1DIndex(index.x + 1, index.y + 1, index.z + 1)];
        voxelData[7] = data[globe3DTo1DIndex(index.x, index.y + 1, index.z + 1)];

        var triangleIndex = 0;
        for (var i: u32 = 0; i < 8; i++) {
            if (voxelData[i] > params.threshold) {
                triangleIndex |= 1 << i;
            }
        }
        var vertex = createVertexs(global_id, voxelData);//output: vec3:f32 [12]

        //ssboOutput[0] = f32(triangleIndex);
        // for (var i: i32 = 0; i < 8; i++) {
        //     ssboOutput[i + 1] = f32(voxelData[i]);
        // }

        //ssboOutput[9] = f32(triangleIndex);
        
        var triVertexIndices : array<i32, 15>;
        for (var i : i32 = 0; i < 15 ; i++) {
            triVertexIndices[i] = triTable[triangleIndex * 15 + i ];
        }
        
    
    
        //var currentNormal = vec3<f32>(0,0,1);
        for (var i: i32 = 0; i < 15; i++) {
            // if (i % 3 == 0) {
            //     var p1 = vertex[triVertexIndices[i]];
            //     var p2 = vertex[triVertexIndices[i + 1]];
            //     var p3 = vertex[triVertexIndices[i + 2]];
            //     //currentNormal = normalize(cross((p1 - p2), (p1 - p3)));
            // }

            var targetVertexIndex = globe3DTo1DIndexVoxel(global_id.x, global_id.y, global_id.z) * 15 + i;
            //ssboOutput[i] = f32(targetVertexIndex);
            
            if (targetVertexIndex < seg) {
                if (triVertexIndices[i] > -1 ) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput[3 * targetVertexIndex + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput[3 * targetVertexIndex + j] = -9999;
                    }
                }
            }
            if (targetVertexIndex >= seg || targetVertexIndex < seg * 2) {
                if (triVertexIndices[i] > -1) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput2[3 * targetVertexIndex - seg + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput2[3 * targetVertexIndex - seg + j] = -9999;
                    }
                }
            }
            if (targetVertexIndex >= seg * 2 || targetVertexIndex < seg * 3) {
                if (triVertexIndices[i] > -1) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput3[3 * targetVertexIndex - seg * 2 + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput3[3 * targetVertexIndex - seg * 2 + j] = -9999;
                    }
                }
            }
            if (targetVertexIndex >= seg * 3 || targetVertexIndex < seg * 4) {
                if (triVertexIndices[i] > -1) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput4[3 * targetVertexIndex - seg * 2 + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput4[3 * targetVertexIndex - seg * 2 + j] = -9999;
                    }
                }
            }
            if (targetVertexIndex >= seg * 4 || targetVertexIndex < seg * 5) {
                if (triVertexIndices[i] > -1) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput5[3 * targetVertexIndex - seg * 2 + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput5[3 * targetVertexIndex - seg * 2 + j] = -9999;
                    }
                }
            }
            if (targetVertexIndex >= seg * 5 || targetVertexIndex < seg * 6) {
                if (triVertexIndices[i] > -1) {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput6[3 * targetVertexIndex - seg * 2 + j] = vertex[triVertexIndices[i]][j];
                    }
                } else {
                    for (var j: i32 = 0; j < 3; j++) {
                        ssboOutput6[3 * targetVertexIndex - seg * 2 + j] = -9999;
                    }
                }
            }
        }      
    }

    fn aa()->vec3<f32>{
        return vec3(1,2,3);
    }

    fn globe3DTo1DIndex(globalx: u32, globaly: u32, globalz: u32) -> i32{
        return i32(globalx + globaly * dimX + globalz * dimX  * dimY);
    }
    fn globe3DTo1DIndexVoxel(globalx: u32, globaly: u32, globalz: u32) -> i32{
        return i32(globalx + globaly * (dimX - 1) + globalz * (dimX - 1) * (dimY - 1));
    }

    fn createVertexs(voxelIndex: vec3<u32>, voxelData: array<f32, 8>) ->  array<vec3<f32>, 12>{
         ////cube position
        var x = f32(voxelIndex.x) * params.pixelSpace;
        var y = f32(voxelIndex.y) * params.pixelSpace;
        var z = f32(voxelIndex.z) * params.sliceThickness;

        ////cube corner position
        var c0 = vec3(x,                        y,                     z);
        var c1 = vec3(x + params.pixelSpace,    y,                     z);
        var c2 = vec3(x + params.pixelSpace,    y + params.pixelSpace, z);
        var c3 = vec3(x,                        y + params.pixelSpace, z);
        var c4 = vec3(x,                        y,                     z + params.sliceThickness);
        var c5 = vec3(x + params.pixelSpace,    y,                     z + params.sliceThickness);
        var c6 = vec3(x + params.pixelSpace,    y + params.pixelSpace, z + params.sliceThickness);
        var c7 = vec3(x,                        y + params.pixelSpace, z + params.sliceThickness);

        var pos: array<vec3<f32>, 12>;
        pos[0] = createVertex(c0, c1, voxelData[0], voxelData[1]);
        pos[1] = createVertex(c1, c2, voxelData[1], voxelData[2]);
        pos[2] = createVertex(c2, c3, voxelData[2], voxelData[3]);
        pos[3] = createVertex(c3, c0, voxelData[3], voxelData[0]);
        pos[4] = createVertex(c4, c5, voxelData[4], voxelData[5]);
        pos[5] = createVertex(c5, c6, voxelData[5], voxelData[6]);
        pos[6] = createVertex(c6, c7, voxelData[6], voxelData[7]);
        pos[7] = createVertex(c7, c4, voxelData[7], voxelData[4]);
        pos[8] = createVertex(c0, c4, voxelData[0], voxelData[4]);
        pos[9] = createVertex(c1, c5, voxelData[1], voxelData[5]);
        pos[10] = createVertex(c2, c6, voxelData[2], voxelData[6]);
        pos[11] = createVertex(c3, c7, voxelData[3], voxelData[7]);

        return pos;
    }

    fn createVertex(p0: vec3<f32>, p1: vec3<f32>, d0: f32, d1: f32) -> vec3<f32>{
        //var diff = d1 - d0;
        // if (abs(diff) > 0.00000001) {
        //     return (p1 - p0) * (params.threshold - d0) / diff + p0;
        // } else {
            return (p0 + p1) * 0.5;
        //}
    }
`;
}

