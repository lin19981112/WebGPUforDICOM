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

export default defineComponent({
  
  name: 'BabylonExamples',

  mounted(){

    // const re = []
    // for (let i = 0; i < 100; i++) {
      
    //   const aaa = new ArrayBuffer(500000000);
    //   re.push(aaa)
    //   console.log(i)
      
    // }
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
