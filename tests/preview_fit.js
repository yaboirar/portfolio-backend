const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/files.js'),'utf8');
const start=source.indexOf('  function paintZoom(){'),end=source.indexOf('  function setZoom(',start);
const code=source.slice(start,end).trim();
function check(width,height,canvasWidth,canvasHeight){
  const classes=new Set(['preview-image-pending']),style={};
  const image={naturalWidth:width,naturalHeight:height,style,classList:{remove(name){assert.ok(parseInt(style.width)>0&&parseInt(style.height)>0,'Fit must precede visibility');classes.delete(name);}},get clientWidth(){return parseInt(style.width)||width},get clientHeight(){return parseInt(style.height)||height}};
  const canvas={clientWidth:canvasWidth,clientHeight:canvasHeight,querySelector:()=>image,classList:{toggle(){}},scrollTop:100,scrollLeft:100};
  const controls={};const get=id=>id==='preview-content'?canvas:controls[id]??(controls[id]={});
  const context={$:get,zoom:{scale:1,x:0,y:0},getComputedStyle:()=>({paddingLeft:'20',paddingRight:'20',paddingTop:'20',paddingBottom:'20'})};
  vm.runInNewContext('('+code+')',context)();
  if(canvasWidth>40&&canvasHeight>40){assert.equal(classes.has('preview-image-pending'),false);assert.ok(parseInt(style.width)<=canvasWidth-40);assert.ok(parseInt(style.height)<=canvasHeight-40);}else assert.equal(classes.has('preview-image-pending'),true);
  assert.equal(canvas.scrollTop,0);assert.equal(canvas.scrollLeft,0);
}
check(3200,600,800,600);check(600,3200,800,600);check(3200,600,0,0);
console.log('PASS: landscape/portrait first frames are fitted before reveal; closed/zero-size layouts stay hidden.');
