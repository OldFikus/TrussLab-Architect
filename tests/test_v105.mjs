import assert from 'node:assert/strict';
import {REGION_WGSL_RENDER, RegionWebGPU, webgpuProjection} from '../js/webgpu_renderer.js';
import {RegionMesh} from '../js/region3d_geometry.js';
assert(REGION_WGSL_RENDER.includes('vertex_main')&&REGION_WGSL_RENDER.includes('fragment_main'));
const P=webgpuProjection(Math.PI/2,1,1,100);
assert(Math.abs(P[10]+100/99)<1e-9);
assert(Math.abs(P[14]+100/99)<1e-9);
let allocations=0,destructions=0,writes=0,draws=0,submits=0;
const fakeBuffer=({size})=>{allocations++;return {size,destroy:()=>{destructions++}}};
const fakeDevice={
 queue:{writeBuffer:(buffer,offset,data)=>{assert(buffer.size>=4);writes++;},submit:commands=>{submits++;assert.equal(commands.length,1)}},
 createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),
 createRenderPipeline:()=>({getBindGroupLayout:i=>({index:i})}),
 createBuffer:fakeBuffer,
 createBindGroup:({entries})=>({entries}),
 createTexture:({size})=>({size,createView:()=>({}),destroy:()=>destructions++}),
 createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:()=>{},setBindGroup:()=>{},setVertexBuffer:()=>{},draw:()=>draws++,end:()=>{}}),finish:()=>({})}),
 lost:new Promise(()=>{}),destroy:()=>{}
};
const gpu={requestAdapter:async()=>({requestDevice:async()=>fakeDevice}),getPreferredCanvasFormat:()=> 'bgra8unorm'};
const stage={appendChild:node=>{stage.last=node}};
const doc={createElement:()=>({style:{},className:'',setAttribute:()=>{},getContext:()=>({configure:()=>{},getCurrentTexture:()=>({createView:()=>({})})}),remove:()=>{}})};
const anchor={ownerDocument:doc,parentElement:stage,style:{}};
const webgpu=await (new RegionWebGPU()).initialize(anchor,{gpu});
assert(webgpu.ready&&stage.last===webgpu.canvas);
assert.equal(anchor.style.opacity,'0');
const mesh=new RegionMesh();mesh.triangle([0,0,0],[10,0,0],[0,1,10],0);
const tile={...mesh.finish(),originX:4000000,originZ:-5000000};
const base={width:800,height:500,vp:Array.from({length:16},(_,i)=>i%5===0?1:0),origin:{x:4000000,z:-5000000},camera:[0,70,0],sun:[0.4,0.8,0.1],groundScale:.703};
webgpu.render([tile],base);
assert.equal(webgpu.uploads,1);assert.equal(webgpu.drawCalls,1);assert.equal(webgpu.buffers.size,1);
webgpu.render([tile],base);
assert.equal(webgpu.uploads,1,'tile geometry must be reused between frames');
assert.equal(draws,2);assert.equal(submits,2);
assert(webgpu.bytes>0&&writes>=5);
webgpu.release(tile);assert.equal(webgpu.buffers.size,0);assert.equal(webgpu.bytes,0);
webgpu.render([tile],{...base,width:1024});assert.equal(webgpu.uploads,2);
webgpu.dispose();assert.equal(anchor.style.opacity,'1');assert(destructions>=5);
console.log(`PASS 10.5: real WebGPU render path, per-tile buffers reused, depth resize, rebase, buffer eviction, WebGL fallback canvas; GPU mocks ${allocations}/${destructions}`);
