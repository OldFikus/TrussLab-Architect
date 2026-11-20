import {MAT,SOILS} from './data.js';
const PI=Math.PI;
function gauss(matrix,force){
 const n=force.length,A=matrix.map((r,i)=>r.concat(force[i])),diag=Math.max(1,...matrix.map((r,i)=>Math.abs(r[i]))),eps=diag*1e-11;
 for(let i=0;i<n;i++){
 let p=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[p][i]))p=j;
 if(Math.abs(A[p][i])<eps)return null;
 [A[i],A[p]]=[A[p],A[i]];
 for(let j=i+1;j<n;j++){let m=A[j][i]/A[i][i];A[j][i]=0;for(let k=i+1;k<=n;k++)A[j][k]-=m*A[i][k]}
 }
 let x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let v=A[i][n];for(let j=i+1;j<n;j++)v-=A[i][j]*x[j];x[i]=v/A[i][i]}
 return x.every(Number.isFinite)?x:null
}
/** Planar matrix stiffness method: 3 DOFs/node (ux, uy, rz). Units: m, kN, kPa. Frame members carry axial + bending; rods/cables axial only. */
export function solveBridge(model,caseName='traffic',factor=1){
 let {nodes,edges}=model,sz=nodes.length*3;
 if(!nodes.length||!edges.length)return {error:'Нужны узлы и элементы.'};
 if(sz>550)return {error:'Слишком много узлов для браузерного учебного расчёта (максимум 183).'};
 let K=Array.from({length:sz},()=>new Float64Array(sz)),F=new Float64Array(sz),ids=new Map(nodes.map((n,i)=>[n.id,i])),hasBeam=new Set(),members=[];
 nodes.forEach((n,i)=>{
 const y=(n.fy||0)*factor,x=(n.fx||0)*factor;
 F[i*3]+=caseName==='wind'?x+Math.abs(y)*.75:(caseName==='earthquake'?x+Math.abs(y)*.45:x);
 F[i*3+1]+=caseName==='snow'?y*1.45:caseName==='wind'?y*.35:caseName==='earthquake'?y*.8:y;
 });
 for(const e of edges){
 let i=ids.get(e.a),j=ids.get(e.b);
 if(i===undefined||j===undefined)return {error:'У стержня потерян узел.'};
 let nd1=nodes[i],nd2=nodes[j],dx=nd2.x-nd1.x,dy=nd2.y-nd1.y,L=Math.hypot(dx,dy);
 if(L<.02)return {error:'Нулевой или очень короткий стержень.'};
 let m=MAT[e.m]||MAT.steel,mult=e.size||1,c=dx/L,s=dy/L,A=m.A*mult,I=m.I*mult**2;
 let axial=m.E*A/L,vec=[c,s,-c,-s],ix=[3*i,3*i+1,3*j,3*j+1];
 for(let a=0;a<4;a++)for(let b=0;b<4;b++)K[ix[a]][ix[b]]+=axial*vec[a]*vec[b];
 if(e.type==='frame'){
 hasBeam.add(i);hasBeam.add(j);
 const EI=m.E*I,L2=L*L,L3=L2*L;
 const kl=[[12*EI/L3,6*EI/L2,-12*EI/L3,6*EI/L2],[6*EI/L2,4*EI/L,-6*EI/L2,2*EI/L],[-12*EI/L3,-6*EI/L2,12*EI/L3,-6*EI/L2],[6*EI/L2,2*EI/L,-6*EI/L2,4*EI/L]];
 const row=[[ -s,c,0,0,0,0],[0,0,1,0,0,0],[0,0,0,-s,c,0],[0,0,0,0,0,1]];
 const dxs=[3*i,3*i+1,3*i+2,3*j,3*j+1,3*j+2];
 for(let a=0;a<6;a++)for(let b=0;b<6;b++){
 let val=0;for(let u=0;u<4;u++)for(let v=0;v<4;v++)val+=row[u][a]*kl[u][v]*row[v][b];
 K[dxs[a]][dxs[b]]+=val
 }
 }
 members.push({e,i,j,L,c,s,m,A,I});
 }
 const locked=new Set();nodes.forEach((n,i)=>{
 if(n.support===1||n.support===3){locked.add(3*i);locked.add(3*i+1)}
 if(n.support===2)locked.add(3*i+1);
 if(n.support===3||!hasBeam.has(i))locked.add(3*i+2);
 });
 if(![...locked].some(v=>v%3===0)||![...locked].some(v=>v%3===1))return {error:'Не закреплены горизонтальные и вертикальные перемещения.'};
 const free=Array.from({length:sz},(_,i)=>i).filter(v=>!locked.has(v));
 let u=new Float64Array(sz);
 if(free.length){const solution=gauss(free.map(i=>free.map(j=>K[i][j])),free.map(i=>F[i]));if(!solution)return {error:'Механизм или потеря устойчивости: добавьте связи либо опоры.'};free.forEach((v,i)=>u[v]=solution[i])}
 let def=0,util=0,forces=[],maxBend=0;
 for(const t of members){const {e,i,j,L,c,s,m,A,I}=t;
 let axial=m.E*A/L*((u[3*j]-u[3*i])*c+(u[3*j+1]-u[3*i+1])*s);
 let limit= axial>=0?m.ft*A:Math.min(m.fc*A,PI*PI*m.E*I/L**2);
 if(e.type==='cable')limit=m.ft*A; // linearized cable; negative axial force checked as invalid separately
 let ratio=Math.abs(axial)/Math.max(.01,limit),moment=0;
 if(e.type==='frame'){
 let vi=-s*u[3*i]+c*u[3*i+1],vj=-s*u[3*j]+c*u[3*j+1];
 let thetaI=u[3*i+2],thetaJ=u[3*j+2],EI=m.E*I;
 let m1=EI*(4*thetaI+2*thetaJ-6*(vj-vi)/L)/L;
 let m2=EI*(2*thetaI+4*thetaJ-6*(vj-vi)/L)/L;
 moment=Math.max(Math.abs(m1),Math.abs(m2));
 // Rectangular-equivalent bending stress estimate, Z approximately sqrt(A*I/12).
 let Z=Math.sqrt(Math.max(1e-9,A*I/12));
 ratio+=moment/(Math.max(1,m.ft)*Z);maxBend=Math.max(maxBend,moment)
 }
 if(e.type==='cable'&&axial<-.01)ratio=Math.max(ratio,1.2); // flag compression in cables; not an active-set cable solution
 util=Math.max(util,ratio);forces.push({id:e.id,axial,moment,ratio,limit,type:e.type})
 }
 for(let i=0;i<nodes.length;i++)def=Math.max(def,Math.hypot(u[3*i],u[3*i+1]));
 const displacements=nodes.map((n,i)=>({id:n.id,dx:u[3*i],dy:u[3*i+1],rotation:u[3*i+2]}));
 const reactions=nodes.map((n,i)=>({id:n.id,rx:K[i*3].reduce((s,v,j)=>s+v*u[j],0)-F[i*3],ry:K[i*3+1].reduce((s,v,j)=>s+v*u[j],0)-F[i*3+1]}));
 const cost=members.reduce((s,t)=>s+t.L*t.m.price*(t.e.size||1),0);
 return {def,util,forces,displacements,reactions,cost,maxBend,loadCase:caseName,totalLoad:Math.abs(F.reduce((s,f,i)=>i%3===1?s+f:s,0)),ok:util<=1&&def<=model.meta.limit&&cost<=model.meta.budget};
}
/** Educational geotechnical formulas. Soil parameters are arbitrary game presets, NOT site investigation measurements. */
export function solveFoundation(p){
 const soil=SOILS[p.soil]||SOILS.sand, W=Number(p.width),L=Number(p.length),P=Number(p.load),depth=Number(p.depth),water=!!p.water;
 const phi=soil.phi*PI/180,gamma=water?Math.max(7,soil.gamma-9.81):soil.gamma,c=soil.c;
 const Nq=phi<1e-7?1:Math.exp(PI*Math.tan(phi))*Math.tan(PI/4+phi/2)**2;
 const Nc=phi<1e-7?5.7:(Nq-1)/Math.tan(phi);
 const Ngamma=phi<1e-7?0:2*(Nq+1)*Math.tan(phi);
 let B=W,area=W*L,shape=1,footCount=1;
 if(p.type==='pad'){B=Math.min(W,L)/5;area=4*B*B;footCount=4;shape=1.2}
 if(p.type==='strip'){B=Math.max(.5,Math.min(3,Number(p.stripWidth)||1.2));area=2*(W+L)*B-4*B*B;shape=1}
 if(p.type==='raft'){B=Math.min(W,L);area=W*L;shape=1+.12*B/Math.max(W,L)}
 // Terzaghi-type gross bearing equation, N_gamma from Vesic estimate, simplified rectangular shape factor.
 const qUlt=Math.max(1,shape*(c*Nc+gamma*depth*Nq+.5*gamma*B*Ngamma));
 const qAllow=qUlt/3;
 let pressure=P/area,settlement=pressure*B*(1-soil.nu**2)/soil.Es*1.05;
 let cost=0,capacity=area*qAllow,pileCap=0,pileQtip=0,pileQskin=0;
 if(p.type==='pad')cost=area*420+4*530+depth*700;
 if(p.type==='strip')cost=area*390+depth*1700;
 if(p.type==='raft')cost=area*360+Math.max(0,depth-.5)*area*60;
 if(p.type==='piles'||p.type==='screw'){
 const n=Math.max(4,Math.round(Number(p.pileCount))),d=p.type==='screw'?.23:.48,length=Math.max(2,Number(p.pileLength));
 const At=PI*d*d/4,per=PI*d;
 // Generalized end bearing + skin friction, with intentionally capped toe pressure and an indicative material cap.
 const qb=Math.min(3000,Math.max(80,c*Nc+gamma*length*Nq+(length>7?(length-7)*215:0)));
 const fs=Math.max(5,.35*(gamma*length/2)*Math.tan(phi)+.55*c);
 pileQtip=At*qb;pileQskin=per*length*fs;
 pileCap=(pileQtip+pileQskin)/3;
 const structural=p.type==='screw'?160:750;
 capacity=n*Math.min(pileCap,structural);
 pressure=P/n;area=n*At;
 // Highly simplified pile-head spring estimate, not a settlement prediction for real piles.
 settlement=(P/n)/(Math.max(3000,soil.Es*.28)*d+1600*length)+P/n*length/((p.type==='screw'?205e6:30e6)*At);
 cost=n*length*(p.type==='screw'?110:125)+W*L*82+1600;
 footCount=n;B=d;
 }
 if(water)settlement*=1.18;
 const ratio=P/Math.max(1,capacity),limit=.05;
 const stable=ratio<=1&&settlement<=limit;
 return {stable,ratio,settlement,capacity,load:P,area,pressure,qUlt,qAllow,Nq,Nc,Ngamma,B,cost,footCount,pileCap,pileQtip,pileQskin,soil:soil.name,limit,water};
}
