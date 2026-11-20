/** TrussLab 11.1: grade-constrained longitudinal terrain approaches.
 * Geometry here uses illustrative scene units, not an as-built bridge survey.
 */
const clampGrade=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function engineerProfile({startX,endX,initialHeight,terrainAt,landAt,road=true,step=1.5}){
 if(![startX,endX,initialHeight,step].every(Number.isFinite)||step<=0||typeof terrainAt!=='function')throw Error('Invalid approach profile');
 const span=Math.abs(endX-startX),n=Math.max(1,Math.ceil(span/step)),dir=Math.sign(endX-startX)||1,dx=span/n;
 const maxGrade=road?0.185:0.097,maxCurvature=road?0.0085:0.0048;
 const sampleOffsets=[-12,-8,-4,0,4,8,12],weights=[1,2,3,4,3,2,1];
 const knots=[{x:startX,y:initialHeight,grade:0}];let y=initialHeight,grade=0;
 for(let i=1;i<=n;i++){
  const x=startX+dir*i*dx;let weighted=0,total=0;
  for(let j=0;j<sampleOffsets.length;j++){
   const sx=clampGrade(x+sampleOffsets[j],Math.min(startX,endX),Math.max(startX,endX));
   if(landAt&&!landAt(sx))continue;
   const h=terrainAt(sx);
   if(Number.isFinite(h)){weighted+=clampGrade(h+.28,-.30,23)*weights[j];total+=weights[j]}
  }
  const target=total?weighted/total:initialHeight;
  const wished=clampGrade((target-y)/13,-maxGrade,maxGrade);
  grade=clampGrade(wished,grade-maxCurvature*dx,grade+maxCurvature*dx);
  grade=clampGrade(grade,-maxGrade,maxGrade);y+=grade*dx;
  knots.push({x,y,grade:grade*dir});
 }
 return {startX,endX,road,step:dx,maxGrade,maxCurvature,knots};
}
export function sampleEngineeredProfile(profile,x){
 const {knots,startX,endX}=profile,t=clampGrade(Math.abs(x-startX)/Math.max(1e-6,Math.abs(endX-startX))*(knots.length-1),0,knots.length-1);
 const i=Math.min(knots.length-2,Math.floor(t)),u=t-i,a=knots[i],b=knots[i+1],dx=b.x-a.x,u2=u*u,u3=u2*u;
 return (2*u3-3*u2+1)*a.y+(u3-2*u2+u)*dx*a.grade+(-2*u3+3*u2)*b.y+(u3-u2)*dx*b.grade;
}
export function profileMetrics(profile){
 const {knots}=profile;let peakGrade=0,peakGradeChange=0;
 for(let i=1;i<knots.length;i++){
  const span=Math.abs(knots[i].x-knots[i-1].x);
  peakGrade=Math.max(peakGrade,Math.abs((knots[i].y-knots[i-1].y)/span));
  peakGradeChange=Math.max(peakGradeChange,Math.abs(knots[i].grade-knots[i-1].grade)/span);
 }
 return {peakGrade,peakGradeChange,segmentCount:knots.length-1,dropOrRise:knots.at(-1).y-knots[0].y};
}
