
export class Slice {
  pixelHU: Array<Array<number>>
  constructor(rows:number,cols:number){
    this.pixelHU = new Array<number[]>(rows)
    for (let i = 0; i < rows; i++) {
      this.pixelHU[i] = new Array<number>(cols)
    }
  }
}
