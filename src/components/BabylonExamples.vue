<template>
<div>
<p>Custom Models</p>

    <input type="file"  multiple/>
<canvas id = "myCanvas"></canvas>
<canvas id = "Canvas2D"></canvas>
</div>

</template>
<script lang="ts">


import { defineComponent } from 'vue';
import {DicomImage} from "@/BabylonExamples/DicomImage"
import { BasicScene } from '@/BabylonExamples/BasicScene';
import { WebGPUtest } from '@/BabylonExamples/WebGPUtest';
import { WebGPU_MC } from '@/BabylonExamples/WebGPU_MC';
import { WebGPUMCtest } from '@/BabylonExamples/WebGPUMCtest';
import Enumerable from 'linq';

export default defineComponent({
  
  name: 'BabylonExamples',

  mounted(){

    // const re2 = []
    // Enumerable.range(0,1000).forEach(j=>{
    //   const re:any[] = []
    //   for (let i = 0; i < 50; i++) {
        
    //     const aaa = new Float32Array(31999995/32);
    //     Enumerable.from(aaa).forEach(a1=>re.push(a1));
    //     console.log(i)
    //   }
    //   re2.push(re)
    //   console.log(j)
    // })

  
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const canvas = document.querySelector("canvas")!;
    //new BasicScene(canvas)
    //new DicomImage(canvas);
    //new WebGPUtest(canvas)
    new WebGPU_MC(canvas)
    //new WebGPUMCtest(canvas)
  },

  methods:{
    aaa: function(files:any){
      console.log(files)
    }
  }
});
</script>

<style scoped>
  canvas{
    width: 100%;
    height: 100%;
  }
</style>
