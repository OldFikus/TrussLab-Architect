import {rendercoreDescriptor} from './rendercore_materials.js';
import {engineerProfile,sampleEngineeredProfile,profileMetrics} from './road_grade.js';
import {sampleGeoLand} from './geo_mask.js';
import {sampleGshhgLand} from './gshhg_data.js';
import {formatLocation,sceneToGeo,geoToScene} from './georef.js';
import {parseGeoPack,sampleCoast,sampleDem} from './geopack.js';
import {parseRouteGeoJSON,sampleRouteLine,lineLengthKm} from './route_geojson.js';
import {SETTLEMENT_TYPES,SettlementStore} from './settlement.js';
import {parseCityGeoJSON,CITY_SPAN} from './geocity.js';
// TrussLab World3D: standalone WebGL 1 scene renderer. No external libraries.
// Visual geometries are artistic representations, not surveyed / BIM data.
const wClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const V=(x=0,y=0,z=0)=>[x,y,z],sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>scale(a,1/(Math.hypot(...a)||1)),lerp=(a,b,t)=>a+(b-a)*t;
function orthographic(left,right,bottom,top,near,far){return [2/(right-left),0,0,0,0,2/(top-bottom),0,0,0,0,-2/(far-near),0,-(right+left)/(right-left),-(top+bottom)/(top-bottom),-(far+near)/(far-near),1]}
function perspective(fovy,aspect,near,far){let f=1/Math.tan(fovy/2);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]}
function lookAt(e,c){let z=norm(sub(e,c)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1]}
function matmul(a,b){let o=new Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+row]*b[col*4+k];o[col*4+row]=s}return o}
// Hand-traced illustrative coastal silhouettes: z -> x boundary, in local world units.
// These are NOT surveyed coordinates or an extraction of satellite image pixels.
const CRIMEA_COAST=[[-210,-164],[-182,-156],[-158,-138],[-136,-128],[-114,-143],[-94,-150],[-70,-126],[-50,-114],[-32,-140],[-11,-132],[9,-116],[27,-128],[50,-133],[69,-151],[93,-141],[114,-160],[140,-184],[166,-168],[190,-185],[210,-171]];
const TAMAN_COAST=[[-210,178],[-181,174],[-162,162],[-140,144],[-117,150],[-94,167],[-70,151],[-48,142],[-27,129],[-7,116],[16,126],[39,134],[60,146],[80,168],[106,155],[131,170],[158,161],[184,183],[210,173]];
function coastShore(z,points){
 if(z<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++)if(z<=points[i][0]){
  const a=points[i-1],b=points[i],t=(z-a[0])/(b[0]-a[0]);
  return a[1]+(b[1]-a[1])*(t*t*(3-2*t));
 }
 return points[points.length-1][1];
}
const shoreNoise=(x,z)=>2.4*Math.sin(z*.13+x*.05)+1.35*Math.sin(z*.30+x*.11)+.75*Math.cos(z*.64-x*.18);

const VS=`attribute vec3 p;attribute vec3 n;attribute float m;uniform mat4 vp;uniform mat4 lightVP;varying vec3 vP;varying vec3 vN;varying float vM;varying float vDist;varying vec4 vShadowCoord;void main(){vP=p;vN=n;vM=m;vec4 q=vp*vec4(p,1.);gl_Position=q;vDist=abs(q.w);vShadowCoord=lightVP*vec4(p,1.);}`;
const SHADOW_VS=`attribute vec3 p;uniform mat4 lightVP;void main(){gl_Position=lightVP*vec4(p,1.);}`;
const SHADOW_FS=`precision highp float;vec4 packDepth(float d){vec4 bitShift=vec4(16777216.,65536.,256.,1.);vec4 bitMask=vec4(0.,1./256.,1./256.,1./256.);vec4 c=fract(d*bitShift);return c-c.xxyz*bitMask;}void main(){gl_FragColor=packDepth(gl_FragCoord.z);}`;
const FS=`precision highp float;
varying vec3 vP;varying vec3 vN;varying float vM;varying float vDist;varying vec4 vShadowCoord;
uniform sampler2D shadowMap;uniform float shadowEnabled;uniform vec2 shadowTexel;
float unpackDepth(vec4 c){return dot(c,vec4(1./16777216.,1./65536.,1./256.,1.));}
float shadowAt(vec2 uv,float depth){return depth>unpackDepth(texture2D(shadowMap,uv))+.0014?1.:0.;}
float getShadow(){
 vec3 sc=vShadowCoord.xyz/max(vShadowCoord.w,.0001);sc=sc*.5+.5;
 if(sc.x<=.002||sc.x>=.998||sc.y<=.002||sc.y>=.998||sc.z<=0.||sc.z>=1.)return 0.;
 vec2 t=shadowTexel*.85;
 return .25*(shadowAt(sc.xy+vec2(-t.x,-t.y),sc.z)+shadowAt(sc.xy+vec2(t.x,-t.y),sc.z)+shadowAt(sc.xy+vec2(-t.x,t.y),sc.z)+shadowAt(sc.xy+vec2(t.x,t.y),sc.z));
}
uniform float time;uniform float dark;uniform float farScale;uniform float weather;uniform vec3 cameraPos;uniform float worldSize;uniform float coastEnabled;uniform sampler2D coastMap;uniform float exposure;uniform float materialSaturation;uniform float fogDensity;uniform float ggxEnabled;uniform float materialRoughness;
uniform vec3 sunDirection;uniform vec3 sunColor;uniform vec3 ambientColor;uniform vec3 lampPositions[12];uniform float lampCount;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.55,v=0.;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.6,6.4);a*=.49;}return v;}
// RenderCore 2: Cook-Torrance GGX NDF, Smith geometry, Schlick Fresnel.
// Approximate direct-light BRDF; there is no IBL or scanned texture pipeline.
float ggxD(float NoH,float rough){float a=rough*rough,a2=a*a;float d=NoH*NoH*(a2-1.)+1.;return a2/max(.001,3.14159265*d*d);}
float ggxSmith(float NoV,float NoL,float rough){float r=rough+1.,k=(r*r)/8.;float gv=NoV/max(.001,NoV*(1.-k)+k),gl=NoL/max(.001,NoL*(1.-k)+k);return gv*gl;}
vec3 ggxFresnel(float HoV,vec3 f0){return f0+(1.-f0)*pow(clamp(1.-HoV,0.,1.),5.);}
float pbrRoughness(float m){
 if(m>2.5&&m<3.5)return .89; // asphalt
 if(m>3.5&&m<4.5)return .82; // concrete
 if(m>4.5&&m<5.5)return .37; // structural steel
 if(m>10.5&&m<11.5)return .38; // rails
 if(m>16.5&&m<18.5)return .48; // barriers/painted metal
 if(m>20.5&&m<21.5)return .13; // glass/clearcoat
 if(m>8.5&&m<9.5)return .92; // sand, gravel
 return .94;
}
float pbrMetallic(float m){
 if(m>4.5&&m<5.5)return .79;
 if(m>10.5&&m<11.5)return .76;
 if(m>11.5&&m<12.5)return .52;
 if(m>16.5&&m<18.5)return .57;
 return 0.;
}
vec3 ggxLight(vec3 albedo,vec3 N,vec3 V,vec3 L,float rough,float metal){
 vec3 H=normalize(V+L);float NoL=max(dot(N,L),0.),NoV=max(dot(N,V),0.);
 float NoH=max(dot(N,H),0.),HoV=max(dot(H,V),0.);
 vec3 f0=mix(vec3(.04),albedo,metal),F=ggxFresnel(HoV,f0);
 float D=ggxD(NoH,rough),G=ggxSmith(NoV,NoL,rough);
 vec3 spec=D*G*F/max(.003,4.*NoV*NoL);
 vec3 diff=(1.-F)*(1.-metal)*albedo/3.14159265;
 return (diff+spec)*NoL;
}
vec3 pal(float m){
if(m<.5)return vec3(.205,.31,.18); if(m<1.5)return vec3(.71,.61,.43); if(m<2.5)return vec3(.35,.27,.20);
if(m<3.5)return vec3(.19,.22,.245);if(m<4.5)return vec3(.63,.66,.65);if(m<5.5)return vec3(.34,.40,.44);
if(m<6.5)return vec3(.12,.36,.48);if(m<7.5)return vec3(.19,.36,.48);if(m<8.5)return vec3(.43,.43,.43);
if(m<9.5)return vec3(.48,.45,.41);if(m<10.5)return vec3(.79,.79,.73);if(m<11.5)return vec3(.27,.33,.36);
if(m<12.5)return vec3(.44,.52,.54);if(m<13.5)return vec3(.53,.45,.34);if(m<14.5)return vec3(.18,.29,.36);
if(m<15.5)return vec3(.21,.36,.24);if(m<16.5)return vec3(.92,.83,.59);if(m<17.5)return vec3(.12,.17,.19);
if(m<18.5)return vec3(.95,.955,.94);if(m<19.5)return vec3(.58,.27,.25);if(m<20.5)return vec3(.70,.73,.71);
if(m<21.5)return vec3(.67,.78,.80);if(m<22.5)return vec3(.65,.38,.22);if(m<23.5)return vec3(1.0,.84,.54);if(m<24.5)return vec3(.86,.90,.93);if(m<25.5)return vec3(.52,.78,.58);if(m<26.5)return vec3(.14,.22,.29);return vec3(.17,.23,.28);
}
void main(){
float m=floor(vM+.5);vec3 N=normalize(vN);vec3 c=pal(m);
if(m>5.5&&m<6.5){float wx=sin(vP.x*1.8+time*.8)+.4*sin(vP.z*2.7+time*.45);float wz=sin(vP.z*1.4-time*.62)+.3*sin(vP.x*2.2-time*.27);N=normalize(vec3(-wx*.045,1.,-wz*.045));}

float large=fbm(vP.xz*.095),med=fbm(vP.xz*.95),fine=noise(vP.xz*8.);
if(m<.5){c=mix(vec3(.18,.28,.155),vec3(.32,.405,.215),large);c+=vec3(.06,.08,.035)*(med-.48);float specks=step(.84,noise(vP.xz*15.));c+=vec3(.07,.10,.025)*specks;}
else if(m<1.5){c=mix(vec3(.57,.48,.33),vec3(.82,.73,.52),large);c*=.86+.24*med+.1*fine;}
else if(m<2.5){c*=.72+.46*large+.17*med;}
else if(m<3.5){
  c*=.91+.13*med;float aggregate=step(.81,noise(vP.xz*16.));c+=aggregate*.045;
  // fine asphalt grain and tar repairs; not an external texture or PBR scan
  float repair=step(.956,fbm(vP.xz*.35));c*=1.-repair*.13;
  float pebble=step(.93,noise(vP.xz*32.));c+=pebble*.035;
 }
else if(m<4.5){
  c*=.90+.14*large+.09*med;
  float pores=step(.87,noise(vP.xz*22.));c-=pores*.052;
  float salt=pow(noise(vP.xy*.13+vP.zz*.08),4.);c+=vec3(.055,.06,.052)*salt;
  float seam=step(.990,fract(vP.x*.43));c-=.08*seam;
 }
else if(m<5.5){
  c*=.90+.14*med;float brushed=noise(vP.xz*vec2(1.8,21.));c+=vec3(.028,.035,.034)*(brushed-.5);
  float rust=pow(max(0.,fbm(vP.xz*.22)-.47),3.5)*7.;
  c=mix(c,vec3(.39,.24,.17),clamp(rust,0.,.27));
 }
else if(m<6.5){
vec2 uv=vP.xz;float wave1=sin(uv.x*1.1+time*.72+sin(uv.y*.83-time*.31))*.5+.5;
float wave2=sin(uv.y*2.1-time*.93+sin(uv.x*.73+time*.21))*.5+.5;
float micro=noise(uv*5.5+vec2(time*.18,-time*.13));
vec3 deep=vec3(.048,.215,.315),shallow=vec3(.15,.47,.515);
c=mix(deep,shallow,.28+.35*wave1+.20*wave2);
c+=.075*pow(wave1*wave2,7.);c+=.05*micro;
float glint=pow(max(0.,sin(uv.x*8.1+uv.y*1.5+time*1.8)*sin(uv.y*8.7-time*1.4)),18.);
c+=vec3(.56,.68,.69)*glint*.45;
if(coastEnabled>.5){vec2 coastUV=clamp(vP.xz/worldSize+.5,vec2(.002),vec2(.998));vec4 coast=texture2D(coastMap,coastUV);c=mix(c,vec3(.17,.49,.50),coast.r*.67);float foam=coast.g*(.5+.5*noise(uv*3.+vec2(time*.09,-time*.13)));c=mix(c,vec3(.77,.88,.82),foam*.55);}
float sparkle=pow(max(0.,sin(uv.x*7.3+uv.y*4.7+time*1.25)),30.);c+=vec3(.13,.18,.17)*sparkle;
}
else if(m<7.5){c*=.85+.2*med;}
else if(m<8.5){c*=.86+.21*med;}
else if(m<9.5){c*=.79+.31*large+.18*fine;}
else if(m<10.5){
 c*=.83+.19*med;float cliff=noise(vP.xy*4.8);c+=vec3(.07,.06,.05)*(cliff-.5);
 float strata=sin(vP.y*7.2+fbm(vP.xz*.45)*4.0);c*=.96+.055*strata;
 }
else if(m<11.5){c*=.9+.16*fine;}
else if(m<12.5){c*=.94+.09*med;}
else if(m<13.5){float fld=floor(vP.x*.065)+floor(vP.z*.055);float parcels=noise(vec2(fld*.13,fld*.19));vec3 fa=vec3(.52,.46,.31),fb=vec3(.40,.47,.27),fc=vec3(.62,.55,.37);c=mix(mix(fa,fb,parcels),fc,med*.45);c*=.82+.22*large+.18*fine;float furrow=step(.965,fract(vP.x*.16))+step(.965,fract(vP.z*.14));c-=furrow*.05;}
else if(m<14.5){c*=.92+.04*med;}
else if(m<15.5){vec3 shrub=mix(vec3(.28,.40,.22),vec3(.44,.51,.30),large);c=shrub*(.84+.26*large+.12*fine);}
else if(m<17.5){c*=.94+.09*med;}
// Sun position and spectral tone are evaluated on CPU, not a fixed fake light.
vec3 sun=normalize(sunDirection);float lam=max(dot(N,sun),0.);
float amb=.20+.70*lam*max(0.,sunDirection.y);
if(weather>.5&&weather<1.5)amb=.27+.74*lam;
if(weather>1.5)amb=.14+.34*lam;
if(ggxEnabled<.5)c*=sunColor;
if(m>17.5&&m<18.5)amb=.68+.34*lam;
if(m>5.5&&m<6.5){amb=.81+.23*lam;
 vec3 viewDir=normalize(cameraPos-vP);float fres=pow(1.-max(0.,dot(N,viewDir)),5.);
 c=mix(c,vec3(.49,.65,.73),fres*.43);
 float spec=pow(max(dot(reflect(-sun,N),viewDir),0.),60.);
 c+=vec3(.89,.95,.92)*spec*.30;
 }
vec3 reflectColor=vec3(.92,.89,.80);float shine=pow(max(0.,dot(reflect(-sun,N),normalize(vec3(.23,.88,1.)))),20.);
if(ggxEnabled<.5&&m>2.5&&m<5.6)c+=shine*.07*reflectColor;
// Approximate microfacet metallic highlights for steel and rail surfaces.
if(ggxEnabled<.5 && ((m>4.5&&m<5.6)||(m>10.5&&m<12.6)||(m>17.5&&m<18.6))){
 vec3 V=normalize(cameraPos-vP),H=normalize(sun+V);float nh=max(dot(N,H),0.);float ndv=max(dot(N,V),0.);
 float gloss=(m>17.5&&m<18.6)?.53:.34;
 float microSpec=pow(nh,mix(20.,90.,gloss))*(.27+.4*ndv);
 c+=vec3(.19,.23,.26)*microSpec;
}
if(m>25.5&&m<26.5){c=weather>1.5?vec3(.96,.72,.37):vec3(.16,.25,.34);amb=weather>1.5?1.3:.57;}
if(m>22.5&&m<23.5){float pulse=.82+.18*sin(time*2.2+vP.x*.3+vP.z*.5);c=vec3(1.0,.82,.48)*pulse;amb=1.0;}
if(m>24.5&&m<25.5){float pulse=.80+.20*sin(time*1.8+vP.x*.2-vP.z*.4);c=vec3(.48,.90,.60)*pulse;amb=1.0;}
if(ggxEnabled>.5 && !(m>5.5&&m<6.5) && !(m>22.5&&m<23.5) && !(m>24.5&&m<25.5)){
 vec3 V=normalize(cameraPos-vP),L=normalize(sunDirection);
 float rough=clamp(pbrRoughness(m)*materialRoughness,.12,.98),metal=pbrMetallic(m);
 vec3 ambientDiffuse=c*ambientColor*.32;
 c=ambientDiffuse+ggxLight(c,N,V,L,rough,metal)*sunColor*2.2;
 if(weather>1.5)c*=.55;
}else c*=amb;
// Cached sunlight shadow map with 4-tap PCF. The dynamic traffic buffer is not recaptured.
if(shadowEnabled>.5&&weather<1.5 && m!=6. && m!=23. && m!=25.)c*=1.-.53*getShadow();
// Bounded local point lighting: only the nearest 12 streetlamps are uploaded.
// At night this genuinely illuminates asphalt, barriers, rolling stock and piers.
if(weather>1.5&&lampCount>.5 && vDist<145. && m>2.5 && !(m>5.5&&m<6.5)){
 vec3 localLight=vec3(0.);
 for(int i=0;i<12;i++){
   if(float(i)>=lampCount)break;
   vec3 delta=lampPositions[i]-vP;float rr=dot(delta,delta);
   float atten=3.6/(1.+rr*.41+rr*rr*.019);
   float diffuse=max(dot(N,normalize(delta)),0.);
   localLight+=vec3(1.0,.73,.43)*atten*(.22+.78*diffuse);
 }
 c+=pal(m)*localLight;
}
if(dark>.5)c*=vec3(.83,.92,1.02);
float fog=clamp((vDist/farScale-.28)*.64*fogDensity,0.,.72);
vec3 sky=weather<1.5?vec3(.68,.82,.88):vec3(.10,.15,.25);
if(weather>.5&&weather<1.5)sky=vec3(.90,.69,.54);
c=mix(c,sky,fog);
float luma=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(luma),c,materialSaturation);
c=max(c*exposure,vec3(0.));c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);gl_FragColor=vec4(pow(clamp(c,vec3(0.),vec3(1.)),vec3(.92)),1.);
}`;
const SKY_VS=`attribute vec2 skyPos; varying vec2 vUv; void main(){vUv=skyPos*.5+.5;gl_Position=vec4(skyPos,0.9999,1.);}`;
const SKY_FS=`precision mediump float; varying vec2 vUv;uniform float skyTime;uniform float skyWeather;
float hash(vec2 p){return fract(sin(dot(p,vec2(43.13,127.07)))*32691.73);}float noise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){float t=vUv.y;vec3 low=vec3(.71,.83,.85),high=vec3(.26,.51,.69);
if(skyWeather>.5&&skyWeather<1.5){low=vec3(.98,.68,.47);high=vec3(.32,.35,.60);}
if(skyWeather>1.5){low=vec3(.13,.21,.32);high=vec3(.017,.035,.085);}
vec3 col=mix(low,high,smoothstep(.08,1.,t));float cloud=noise(vec2(vUv.x*8.+skyTime*.002,t*10.));cloud+=.45*noise(vec2(vUv.x*20.+skyTime*.01,t*24.));cloud+=.17*noise(vec2(vUv.x*43.-skyTime*.013,t*53.));cloud=smoothstep(.75,1.22,cloud);col=mix(col,vec3(.88,.90,.88),cloud*(skyWeather>1.5?.04:.32));
if(skyWeather>1.5){float stars=step(.996,hash(floor(vUv*vec2(860.,520.))));col+=vec3(.60,.73,1.)*stars*.38*smoothstep(.14,.73,t);}
vec2 sun=vec2(.77,.56);float radius=distance(vUv,sun);float glow=pow(max(0.,1.-radius*2.7),4.);col+=vec3(1.,.79,.49)*glow*(skyWeather>1.5?.02:.32);
gl_FragColor=vec4(col,1.);}`;
function makeShader(gl,t,src){let s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
class Mesh{
 constructor(){this.a=[]}
 triangle(a,b,c,m){let n=norm(cross(sub(b,a),sub(c,a)));for(let p of [a,b,c])this.a.push(...p,...n,m)}
 quad(a,b,c,d,m){this.triangle(a,b,c,m);this.triangle(a,c,d,m)}
 box(x,y,z,w,h,d,m){let a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],dd=[x-w/2,y,z+d/2],A=[x-w/2,y+h,z-d/2],B=[x+w/2,y+h,z-d/2],C=[x+w/2,y+h,z+d/2],D=[x-w/2,y+h,z+d/2];this.quad(a,dd,c,b,m);this.quad(A,B,C,D,m);this.quad(a,b,B,A,m);this.quad(b,c,C,B,m);this.quad(c,dd,D,C,m);this.quad(dd,a,A,D,m)}
 tube(a,b,r,m,steps=6){if(Math.hypot(...sub(a,b))<.0001)return;let d=norm(sub(b,a)),side=norm(cross(d,Math.abs(d[1])>.95?[1,0,0]:[0,1,0])),other=cross(d,side);for(let k=0;k<steps;k++){let p=k*Math.PI*2/steps,q=(k+1)*Math.PI*2/steps,u=add(scale(side,Math.cos(p)*r),scale(other,Math.sin(p)*r)),v=add(scale(side,Math.cos(q)*r),scale(other,Math.sin(q)*r));this.quad(add(a,u),add(a,v),add(b,v),add(b,u),m)}}
 prismBetween(a,b,height,width,mat){
  // A rectangular steel box section for the arch ribs. The wide dimension follows the local Z direction.
  const dir=norm(sub(b,a)),vertical=Math.hypot(dir[0],dir[1])<.001?[0,1,0]:norm([-dir[1],dir[0],0]),side=Math.abs(dir[2])>.95?[1,0,0]:[0,0,1];
  const corner=(origin,signHeight,signWidth)=>add(origin,add(scale(vertical,signHeight*height*.5),scale(side,signWidth*width*.5)));
  const p=[corner(a,-1,-1),corner(a,1,-1),corner(a,1,1),corner(a,-1,1)];
  const q=[corner(b,-1,-1),corner(b,1,-1),corner(b,1,1),corner(b,-1,1)];
  for(let i=0;i<4;i++)this.quad(p[i],q[i],q[(i+1)%4],p[(i+1)%4],mat);
  this.quad(p[0],p[1],p[2],p[3],mat);this.quad(q[3],q[2],q[1],q[0],mat)
 }
 roof(cx,y,cz,w,d,rise,mat){let e=.25,a=[cx-w/2-e,y,cz-d/2-e],b=[cx+w/2+e,y,cz-d/2-e],c=[cx+w/2+e,y,cz+d/2+e],f=[cx-w/2-e,y,cz+d/2+e],r=[cx,y+rise,cz-d/2-e],R=[cx,y+rise,cz+d/2+e];this.quad(a,r,R,f,mat);this.quad(r,b,c,R,mat);this.triangle(a,b,r,mat);this.triangle(f,R,c,mat)}
 clear(){this.a.length=0}
}
function clampTerrain(v){return wClamp(v,-3,7)}
export class World3D{
 constructor(canvas){this.canvas=canvas;this.gl=null;try{this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true})}catch(err){console.warn('TrussLab: browser denied WebGL, using CPU renderer.',err)}this.software=!this.gl;this.ready=true;this.ctx=this.software?canvas.getContext('2d'):null;this.yaw=-2.18;this.pitch=-.18;this.zoom=1;this.moveSpeed=1.2;this.keys={};this.quality='ultra';this.resolutionScale=1;this.stats={frames:0,fps:0,triangles:0,meshMs:0,lastMeasure:0};this.coastDirty=true;this.coastTex=null;this.daylight='day';this.sunHour=13.0;this.lampsEnabled=true;this.exposure=1.00;this.materialSaturation=1.0;this.fogDensity=1.0;this.ggxEnabled=true;this.materialRoughness=1.0;this.shadowsEnabled=true;this.shadowDirty=true;this.shadowSize=0;this.shadowMap=null;this.shadowFbo=null;this.shadowDepth=null;this.lastShadowDraw=-1;this.sceneDirty=true;this.bufferDirty=true;this.mapEdit=new Float32Array(65*65);this.currentKey='';this.editBridge=false;this.selectedBridgeNode=null;this.mesh=new Mesh();this.trafficMesh=new Mesh();this.settlement=new SettlementStore();this.buildingMesh=new Mesh();this.cityData=null;this.cityEnabled=true;this.cityCache=new Map();this.cityVisible=[];this.cityTilesBuilt=0;this.cityTilesUploaded=0;this.buildingCount=0;this.buildingMeshDirty=true;this.buildingBufferDirty=true;this.placeMode=false;this.settlementSelectedId=null;this.trafficCount=0;this.trafficEnabled=!this.software;this.trafficDirty=true;this.trafficBufferDirty=true;this.trafficUpdates=0;this.staticBuilds=0;this.terrain=new Float32Array(65*65);this.paintLayer=new Uint8Array(65*65);this.brush='orbit';this.radius=4;this.theme='dark';this.time=0;this.lastState=null;this.message='';this.worldSize=72;this.map=false;this.sceneId='';this.routeOffsets=new Array(13).fill(0);this.routeExtents={x0:-118,x1:118};this.approachProfileCache=new Map();this.geoRoute=null;this.geoRouteSource=null;this.chunkSpan=35;this.chunkCache=new Map();this.visibleChunks=[];this.chunksBuilt=0;this.chunksVisible=0;this.chunkedTerrain=!this.software;this.gisMask=null;this.gisLandFeatures=0;this.gisBounds=null;this.coastMode='reference';this.geoPack=null;this.geoPackSource=null;this.demEnabled=false;this.demMetresPerUnit=8;this.roadRamp=22;this.railRamp=58;this.archDeckLevel=7.35;this.deckBaseLevel=4.3;this.drag=null;this.camPos=[0,18,72];this.animationTime=0;this.animBucket=-1;this.cameraMode='manual';this.eye=this.camPos.slice();this.focal=[0,2,0];this.initTerrain('sand');if(this.software){this.patterns=this.makePatterns();this.bindEvents();return;}try{let gl=this.gl;let prog=gl.createProgram();gl.attachShader(prog,makeShader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(prog,makeShader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));this.prog=prog;this.ap=gl.getAttribLocation(prog,'p');this.an=gl.getAttribLocation(prog,'n');this.am=gl.getAttribLocation(prog,'m');this.uvp=gl.getUniformLocation(prog,'vp');this.ut=gl.getUniformLocation(prog,'time');this.ud=gl.getUniformLocation(prog,'dark');this.uf=gl.getUniformLocation(prog,'farScale');this.uw=gl.getUniformLocation(prog,'weather');this.uc=gl.getUniformLocation(prog,'cameraPos');this.uWorldSize=gl.getUniformLocation(prog,'worldSize');this.uCoastEnabled=gl.getUniformLocation(prog,'coastEnabled');this.uCoast=gl.getUniformLocation(prog,'coastMap');this.uExposure=gl.getUniformLocation(prog,'exposure');this.uMaterialSaturation=gl.getUniformLocation(prog,'materialSaturation');this.uFogDensity=gl.getUniformLocation(prog,'fogDensity');this.uGGX=gl.getUniformLocation(prog,'ggxEnabled');this.uRoughness=gl.getUniformLocation(prog,'materialRoughness');this.uSunDir=gl.getUniformLocation(prog,'sunDirection');this.uSunColor=gl.getUniformLocation(prog,'sunColor');this.uAmbientColor=gl.getUniformLocation(prog,'ambientColor');this.uLampPositions=gl.getUniformLocation(prog,'lampPositions[0]');this.uLampCount=gl.getUniformLocation(prog,'lampCount');this.uLightVP=gl.getUniformLocation(prog,'lightVP');this.uShadowMap=gl.getUniformLocation(prog,'shadowMap');this.uShadowOn=gl.getUniformLocation(prog,'shadowEnabled');this.uShadowTexel=gl.getUniformLocation(prog,'shadowTexel');this.buffer=gl.createBuffer();this.dynamicBuffer=gl.createBuffer();this.buildingBuffer=gl.createBuffer();this.coastTex=gl.createTexture();
// Optional WebGL 1 shadow framebuffer; graceful fallback when GPU doesn't support it.
try{const sh=gl.createProgram();gl.attachShader(sh,makeShader(gl,gl.VERTEX_SHADER,SHADOW_VS));gl.attachShader(sh,makeShader(gl,gl.FRAGMENT_SHADER,SHADOW_FS));gl.linkProgram(sh);
 if(gl.getProgramParameter(sh,gl.LINK_STATUS)){this.shadowProg=sh;this.shadowP=gl.getAttribLocation(sh,'p');this.shadowVP=gl.getUniformLocation(sh,'lightVP');}
}catch(e){console.warn('Shadows unavailable',e);this.shadowsEnabled=false;}
// Atmospheric gradient behind the geometry (WebGL 1, no external textures or dependencies).
let sky=gl.createProgram();gl.attachShader(sky,makeShader(gl,gl.VERTEX_SHADER,SKY_VS));gl.attachShader(sky,makeShader(gl,gl.FRAGMENT_SHADER,SKY_FS));gl.linkProgram(sky);
if(gl.getProgramParameter(sky,gl.LINK_STATUS)){
this.skyProg=sky;this.skyPosLoc=gl.getAttribLocation(sky,'skyPos');this.skyTime=gl.getUniformLocation(sky,'skyTime');this.skyWeather=gl.getUniformLocation(sky,'skyWeather');this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
}
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);this.bindEvents()}catch(err){
 // The WebGL context cannot be converted to 2D. Replace it with a fresh canvas.
 console.warn('TrussLab: WebGL initialization failed; using CPU renderer.',err);
 const replacement=this.canvas.cloneNode(false);
 this.canvas.replaceWith(replacement);
 this.canvas=replacement;this.gl=null;this.software=true;this.chunkedTerrain=false;this.trafficEnabled=false;
 this.ctx=replacement.getContext('2d');
 if(!this.ctx)throw new Error('No 2D canvas context available.');
 this.patterns=this.makePatterns();this.bindEvents();
 this.message='Резервная 3D-отрисовка активна';
 }}

 /** Continuous time-of-day lighting (visual simulation, no astronomical GIS ephemeris). */
 setSunHour(hour){
  if(!Number.isFinite(hour))return false;
  this.sunHour=wClamp(hour,0,24);this.shadowDirty=true;this.daylight=this.sunHour<5||this.sunHour>=20?'night':this.sunHour<8||this.sunHour>=17?'sunset':'day';
  return true;
 }
 lightingRig(){
  const hour=this.sunHour,elevation=Math.sin((hour-6)/12*Math.PI),e=Math.max(-.18,elevation),az=(hour-12)*.21;
  const sun=norm([-Math.cos(az)*Math.max(.35,Math.cos(e*.85)),Math.max(.10,e),.52+Math.sin(az)*.68]);
  const golden=this.daylight==='sunset',night=this.daylight==='night';
  return {sun, color:night?[.49,.62,.94]:golden?[1.15,.80,.57]:[1.03,1.025,.97]};
 }
 nearestLampPositions(){
  if(!this.map||!this.lampsEnabled||this.daylight!=='night')return [];
  const b=this.kerchBounds(),points=[];
  for(let x=b.x0+4;x<b.x1-2;x+=5.2){
   const p=this.kerchSample(x,b.roadSide),v=[x,p[1]+1.84,p[2]-2.27];
   const dist=(v[0]-this.camPos[0])**2+(v[1]-this.camPos[1])**2+(v[2]-this.camPos[2])**2;
   points.push({v,dist});
  }
  const count=this.quality==='ultra'?12:this.quality==='high'?8:this.quality==='medium'?4:0;
  return points.sort((a,b)=>a.dist-b.dist).slice(0,count).map(p=>p.v);
 }
 cameraBasis(){let cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),forward=norm([cp*sy,sp,cp*cy]),right=norm(cross(forward,[0,1,0]));if(Math.hypot(...right)<1e-5)right=[1,0,0];let up=cross(right,forward);return {forward,right,up}}
setPresetCamera(kind){
 if(kind==='overview'){this.camPos=[-76,34,48];this.yaw=1.97;this.pitch=-.24;this.moveSpeed=1.28;}
 else if(kind==='arch'){this.camPos=[-72,13,23];this.yaw=2.15;this.pitch=-.15;this.moveSpeed=.65;}
 else if(kind==='water'){this.camPos=[-68,3.2,17];this.yaw=2.38;this.pitch=.02;this.moveSpeed=.70;}
 else if(kind==='road'){this.camPos=[-78,5.5,-9.8];this.yaw=1.52;this.pitch=-.023;this.moveSpeed=.75;}
 else if(kind==='map'){this.camPos=[0,138,8];this.yaw=1.56;this.pitch=-1.43;this.moveSpeed=2.4;}
 else if(kind==='kerch'){this.camPos=[-120,24,35];this.yaw=1.72;this.pitch=-.22;this.moveSpeed=1.22;}
 else if(kind==='tuzla'){this.camPos=[-18,26,33];this.yaw=1.63;this.pitch=-.34;this.moveSpeed=1.10;}
 else if(kind==='taman'){this.camPos=[106,30,42];this.yaw=-1.62;this.pitch=-.29;this.moveSpeed=1.22;}
 else if(kind==='crimea-abutment'||kind==='taman-abutment'){
  const b=this.kerchBounds(),west=kind==='crimea-abutment',edge=west?b.x0:b.x1;
  const p=this.kerchSample(edge,b.roadSide),destination=[edge,p[1],p[2]];
  this.camPos=[edge+(west?-12:12),p[1]+8,p[2]+12];
  const d=sub(destination,this.camPos);this.yaw=Math.atan2(d[0],d[2]);this.pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]));this.moveSpeed=.55;
 }
 else if(kind==='foundation'){this.camPos=[-16,9,20];this.yaw=-2.28;this.pitch=-.22;this.moveSpeed=1.05;}
 else {this.camPos=[-22,10,28];this.yaw=-2.22;this.pitch=-.19;this.moveSpeed=1.1;}
 this.zoom=1;this.keys={};this.prevTime=0;
 }

step(dt){if(!this.keys)return;let {forward,right}=this.cameraBasis(),speed=(this.keys.ShiftLeft||this.keys.ShiftRight?3.6:1.8)*this.moveSpeed*(dt/16.67),flatF=norm([forward[0],0,forward[2]]),flatR=norm([right[0],0,right[2]]),move=[0,0,0];if(this.keys.KeyW)move=add(move,flatF);if(this.keys.KeyS)move=sub(move,flatF);if(this.keys.KeyA)move=sub(move,flatR);if(this.keys.KeyD)move=add(move,flatR);if(this.keys.KeyQ)move[1]-=1;if(this.keys.KeyE)move[1]+=1;if(Math.hypot(...move)>0){move=scale(norm(move),speed);this.camPos=add(this.camPos,move);let lim=this.worldSize*.67;this.camPos[0]=wClamp(this.camPos[0],-lim,lim);this.camPos[2]=wClamp(this.camPos[2],-lim,lim);this.camPos[1]=wClamp(this.camPos[1],1.1,Math.max(65,this.worldSize*.72))}}
 makePatterns(){let palette=['#49694b','#bfa87c','#765c46','#353f49','#9da9a6','#72868c','#3989a9','#547177','#756f69','#8d8880','#deded2','#52616c','#769dad','#a89472','#435c65','#44704c','#eed2a2','#35393e','#b9cbd0','#bd5742','#d0ded7','#bad0dc','#a76f48'];return palette.map((color,kind)=>{let c=document.createElement('canvas');c.width=64;c.height=64;let g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,64,64);for(let j=0;j<320;j++){let x=(j*37.71+kind*17)%64,y=(j*19.57+kind*11)%64,alpha=.03+(j%7)*.012;g.fillStyle=j%3?'rgba(11,24,29,'+alpha+')':'rgba(255,255,239,'+alpha+')';g.fillRect(x,y,1+(j%3),1+(j%2))}if(kind===8||kind===9){g.strokeStyle='#171e2520';g.lineWidth=1;for(let y=0;y<=64;y+=11){g.beginPath();g.moveTo(0,y);g.lineTo(64,y);g.stroke()}if(kind===9)for(let x=0;x<=64;x+=23){g.beginPath();g.moveTo(x,0);g.lineTo(x,64);g.stroke()}}if(kind===0||kind===15){g.strokeStyle='#e8f3df26';for(let j=0;j<65;j++){let x=(j*47)%64,y=(j*31)%64;g.beginPath();g.moveTo(x,y);g.lineTo(x+1,y-3);g.stroke()}}return this.ctx.createPattern(c,'repeat')})}
 renderSoftware(w,h,ratio){let ctx=this.ctx,mesh=this.mesh.a.concat(this.buildingMesh.a,this.trafficMesh.a),eye=this.eye,{forward,right,up}=this.cameraBasis(),f=h/(2*Math.tan(Math.PI/6));ctx.setTransform(ratio,0,0,ratio,0,0);let sky=ctx.createLinearGradient(0,0,0,h),sunset=this.daylight==='sunset',night=this.daylight==='night';
sky.addColorStop(0,night?'#15253b':sunset?'#6d729d':'#578caf');
sky.addColorStop(.55,night?'#293c5c':sunset?'#efad8b':'#9ac4d7');
sky.addColorStop(1,night?'#4a5967':sunset?'#e9cda6':'#c9d8d1');
ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);let triangles=[];
 for(let i=0;i<mesh.length;i+=21){let pts=[],dep=0,faceNormal=mesh.slice(i+3,i+6),mid=[0,0,0],mat=Math.round(mesh[i+6]);for(let j=0;j<3;j++){let k=i+j*7,v=mesh.slice(k,k+3),q=sub(v,eye),z=dot(q,forward);if(z<.20){pts=[];break}pts.push([w/2+f*dot(q,right)/z,h/2-f*dot(q,up)/z]);dep+=z;mid=add(mid,v)}if(pts.length!==3)continue;mid=scale(mid,1/3);let light=Math.max(0,dot(norm(faceNormal),norm([-.47,.88,.34]))),shading=.60+.5*light,toned=shading*(this.theme==='dark'?.80:1);triangles.push({pts,depth:dep/3,mat,toned,mid})}
 triangles.sort((a,b)=>b.depth-a.depth);let patterns=this.patterns;
 for(let q of triangles){let p=q.pts;ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);ctx.lineTo(p[1][0],p[1][1]);ctx.lineTo(p[2][0],p[2][1]);ctx.closePath();ctx.fillStyle=patterns[q.mat]||patterns[0];ctx.fill();ctx.fillStyle=q.toned<.9?'rgba(7,18,22,'+Math.min(.46,(1-q.toned)*.6)+')':'rgba(245,249,227,'+Math.min(.2,(q.toned-.9)*.12)+')';ctx.fill()}
 this.message=(this.map?'Керчь — Тузла — Тамань · GeoWorld 9.2':this.lastState.track==='foundation'?'3D дом и редактируемая поверхность грунта':'3D сцена моста, синхронизированная с 2D')+' · программный рендер без WebGL';
 }
 initTerrain(soil){for(let z=0;z<65;z++)for(let x=0;x<65;x++){let i=z*65+x;this.terrain[i]=0.22*Math.sin(x*.28)*Math.cos(z*.31)+.12*Math.sin(z*.61+x*.18);this.paintLayer[i]=['peat','clay','loam','fill'].includes(soil)?2:['sand','silt'].includes(soil)?1:['gravel','rock'].includes(soil)?3:0}}
 getSize(){return this.worldSize}
 sample(x,z){let a=(x/this.worldSize+.5)*64,b=(z/this.worldSize+.5)*64,i=wClamp(Math.floor(a),0,63),j=wClamp(Math.floor(b),0,63),u=wClamp(a-i,0,1),v=wClamp(b-j,0,1),t=this.terrain;let h=(ii,jj)=>t[jj*65+ii];return (h(i,j)*(1-u)+h(i+1,j)*u)*(1-v)+(h(i,j+1)*(1-u)+h(i+1,j+1)*u)*v}
 start(state){this.approachProfileCache.clear();this.buildingMeshDirty=true;this.buildingBufferDirty=true;this.sceneId=state.id||'';this.map=state.track==='bridge'&&state.id==='kerch';this.worldSize=this.map?420:state.track==='foundation'?56:Math.max(120,(state.span||40)*3.2);this.initTerrain(state.soil||'sand');this.clearTerrainChunks();if(this.map)this.mapEdit.fill(0);this.sceneDirty=true;this.coastDirty=true;this.trafficDirty=true;this.setPresetCamera(this.map?'kerch':state.track==='foundation'?'foundation':'bridge');this.currentKey='';this.render(state)}
 makeLand(m,state){let N=this.map?(this.software?34:this.chunkedTerrain?48:this.quality==='ultra'?192:this.quality==='high'?122:this.quality==='medium'?80:50):(this.software?34:this.quality==='ultra'?118:this.quality==='high'?82:51),S=this.worldSize,h=(x,z)=>this.map?this.mapHeight(x,z):this.sample(x,z);
 const drawGroundCell=(x0,x1,z0,z1,i,j)=>{
 let y0=h(x0,z0),y1=h(x1,z0),y2=h(x1,z1),y3=h(x0,z1),mid=(y0+y1+y2+y3)*.25,mat=0;
 if(this.map){mat=mid<-.9?2:mid<-.25?1:mid<.68?13:((Math.sin(x0*.075)+Math.cos(z0*.067))>-.15?13:((Math.sin(x0*.13+z0*.038)+Math.cos(z0*.28))>.5?15:0));
 if(Math.max(y0,y1,y2,y3)-Math.min(y0,y1,y2,y3)>2.1&&mid>.25)mat=9;
 if(mid>5.5&&mat===13)mat=15;
 let paintIndex=wClamp(Math.floor(j/N*64),0,64)*65+wClamp(Math.floor(i/N*64),0,64),pm=this.paintLayer[paintIndex];if(pm===1)mat=1;if(pm===3)mat=9;if(pm===4)mat=3;
 }else{let u=wClamp(Math.floor((i/N)*64),0,64),v=wClamp(Math.floor(j/N*64),0,64);mat=[0,1,2,9,3,3][this.paintLayer[v*65+u]]||0;if(state.soil==='rock'&&mat===0)mat=9}
 if(this.map){
  // Clip land polygon against the water level; no seabed triangles can pop through the opaque sea.
  let face=[[x0,y0,z0],[x0,y3,z1],[x1,y2,z1],[x1,y1,z0]],level=-1.488,clipped=[];
  for(let k=0;k<face.length;k++){
   let a=face[k],b=face[(k+1)%face.length],inside=a[1]>=level,next=b[1]>=level;
   if(inside)clipped.push(a);
   if(inside!==next){let t=(level-a[1])/(b[1]-a[1]);clipped.push(add(a,scale(sub(b,a),t)))}
  }
  for(let k=1;k+1<clipped.length;k++)m.triangle(clipped[0],clipped[k],clipped[k+1],mat);
 }else m.quad([x0,y0,z0],[x0,y3,z1],[x1,y2,z1],[x1,y1,z0],mat)
 };
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const x0=S*(i/N-.5),x1=S*((i+1)/N-.5),z0=S*(j/N-.5),z1=S*((j+1)/N-.5);
  // Only road corridors need adaptive tessellation. Elsewhere keep the
  // existing inexpensive coarse base layer.
  const near=this.map&&this.cellNearBridgeCorridor(x0,x1,z0,z1);
  const subdivisions=near?Math.min(8,Math.max(2,Math.ceil((x1-x0)/(this.software?2.6:1.65)))):1;
  for(let jj=0;jj<subdivisions;jj++)for(let ii=0;ii<subdivisions;ii++){
   const sx0=x0+(x1-x0)*ii/subdivisions,sx1=x0+(x1-x0)*(ii+1)/subdivisions;
   const sz0=z0+(z1-z0)*jj/subdivisions,sz1=z0+(z1-z0)*(jj+1)/subdivisions;
   drawGroundCell(sx0,sx1,sz0,sz1,i,j);
  }
 }
 if(this.map){let y=-1.49;
 // Use a tessellated water plane: unlike a single giant quad it also clips correctly in the CPU fallback camera.
 let wn=this.software?18:this.quality==='ultra'?52:28;
 for(let jj=0;jj<wn;jj++)for(let ii=0;ii<wn;ii++){
  let oceanS=S*2.9,ax=oceanS*(ii/wn-.5),bx=oceanS*((ii+1)/wn-.5),az=oceanS*(jj/wn-.5),bz=oceanS*((jj+1)/wn-.5);
  m.quad([ax,y,az],[ax,y,bz],[bx,y,bz],[bx,y,az],6);
 }
 
 // Floating visual foam along shallow shelves (decorative, not a hydrographic map)
 for(let k=0;k<95;k++){let x=-S/2+((k*17.731)%S),z=-S/2+((k*29.41)%S),y0=this.mapHeight(x,z);if(y0>-1.62&&y0<-.72)m.box(x,-1.485,z,.38,.006,.07,21)}
 // Fine white surf follows the mathematical shoreline, rather than a straight blue polygon boundary.
 let step=this.software?4:this.quality==='ultra'?1:this.quality==='high'?2:3,Nwater=N;
 for(let j=0;j<Nwater;j+=step)for(let i=0;i<Nwater;i+=step){
 let x0=S*(i/Nwater-.5),x1=S*((i+step)/Nwater-.5),z0=S*(j/Nwater-.5),z1=S*((j+step)/Nwater-.5);
 let corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],vals=corners.map(v=>this.mapHeight(v[0],v[1])),cuts=[];
 for(let k=0;k<4;k++){let n=(k+1)%4,v=vals[k]-y,u=vals[n]-y;if(v*u<0){let f=v/(v-u);cuts.push([corners[k][0]*(1-f)+corners[n][0]*f,y+.03,corners[k][1]*(1-f)+corners[n][1]*f])}}
 if(cuts.length>=2)m.tube(cuts[0],cuts[1],.025,21,4);
 }
 }else if(state.soil==='peat'||state.soil==='silt'){m.box(0,-.78,0,S,.10,S,6)}
 }

 // Geographically anchored game sectors. Streaming replaces detailed geometry only;
 // a coarse base keeps the whole coastline visible during camera flight.
 clearTerrainChunks(){
  this.shadowDirty=true;
  if(this.gl)for(const tile of this.chunkCache.values())this.gl.deleteBuffer(tile.buffer);
  this.chunkCache.clear();this.visibleChunks=[];this.chunksVisible=0;
 }
 terrainTileMesh(tx,tz,lod){
  const out=new Mesh(),span=this.chunkSpan,level=-1.486;
  const h=(x,z)=>this.mapHeight(x,z)+.024;
  const emitCell=(x0,x1,z0,z1)=>{
   const v=[[x0,h(x0,z0),z0],[x0,h(x0,z1),z1],[x1,h(x1,z1),z1],[x1,h(x1,z0),z0]];
   const center=(v[0][1]+v[1][1]+v[2][1]+v[3][1])/4;
   let mat=center<-.9?2:center<-.22?1:center<.68?13:((Math.sin(x0*.075)+Math.cos(z0*.067))>-.15?13:15);
   const variation=Math.max(...v.map(p=>p[1]))-Math.min(...v.map(p=>p[1]));
   if(variation>1.7&&center>.2)mat=9;
   if(center>5.5&&mat===13)mat=15;
   const clipped=[];
   for(let k=0;k<4;k++){
    const a=v[k],b=v[(k+1)%4],inside=a[1]>=level,next=b[1]>=level;
    if(inside)clipped.push(a);
    if(inside!==next){const t=(level-a[1])/(b[1]-a[1]);clipped.push(add(a,scale(sub(b,a),t)))}
   }
   for(let k=1;k+1<clipped.length;k++)out.triangle(clipped[0],clipped[k],clipped[k+1],mat);
  
  };
  for(let j=0;j<lod;j++)for(let i=0;i<lod;i++){
   const x0=tx*span+span*i/lod,x1=tx*span+span*(i+1)/lod;
   const z0=tz*span+span*j/lod,z1=tz*span+span*(j+1)/lod;
   const refine=this.cellNearBridgeCorridor(x0,x1,z0,z1);
   const n=refine?Math.min(6,Math.max(2,Math.ceil((x1-x0)/1.60))):1;
   for(let jj=0;jj<n;jj++)for(let ii=0;ii<n;ii++){
    emitCell(x0+(x1-x0)*ii/n,x0+(x1-x0)*(ii+1)/n,z0+(z1-z0)*jj/n,z0+(z1-z0)*(jj+1)/n);
   }
  }

  return out;
 }
 streamTerrain(maxBuild=3){
  if(!this.map||this.software||!this.gl||!this.chunkedTerrain)return false;
  const span=this.chunkSpan,half=this.worldSize*.5;
  const origin=Math.floor(-half/span),end=Math.ceil(half/span)-1;
  const look=this.cameraBasis().forward;
  const cx=Math.floor((this.camPos[0]+look[0]*span*.8)/span);
  const cz=Math.floor((this.camPos[2]+look[2]*span*.8)/span);
  const radius=this.camPos[1]>85?6:this.camPos[1]>45?5:4;
  const candidates=[];
  for(let tz=Math.max(origin,cz-radius);tz<=Math.min(end,cz+radius);tz++)
   for(let tx=Math.max(origin,cx-radius);tx<=Math.min(end,cx+radius);tx++){
    const distance=Math.max(Math.abs(tx-cx),Math.abs(tz-cz));
    const lod=this.quality==='low'?6:distance<=1?(this.quality==='ultra'?40:24):distance<=3?(this.quality==='ultra'?18:12):6;
    candidates.push({tx,tz,lod,distance,key:`${tx}:${tz}:${lod}`});
   }
  candidates.sort((a,b)=>a.distance-b.distance);
  let built=0,changed=false;
  for(const c of candidates){
   if(this.chunkCache.has(c.key))continue;
   if(built>=maxBuild)break;
   const mesh=this.terrainTileMesh(c.tx,c.tz,c.lod),gl=this.gl,buf=gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER,buf);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.a),gl.STATIC_DRAW);
   this.chunkCache.set(c.key,{...c,buffer:buf,count:mesh.a.length/7});
   this.chunksBuilt++;built++;changed=true;
  }
  const visible=[];
  for(const c of candidates){
   const exact=this.chunkCache.get(c.key);
   const backup=exact||[40,24,18,12,6].map(l=>this.chunkCache.get(`${c.tx}:${c.tz}:${l}`)).find(Boolean);
   if(backup)visible.push(backup);
  }
  this.visibleChunks=visible;this.chunksVisible=visible.length;
  if(changed)this.shadowDirty=true;
  // Keep a bounded cache; old sectors free GPU memory as the player travels.
  if(this.chunkCache.size>170){
   const desired=new Set(visible.map(v=>v.key));
   for(const [k,v] of this.chunkCache){
    if(this.chunkCache.size<=135)break;
    if(!desired.has(k)){this.gl.deleteBuffer(v.buffer);this.chunkCache.delete(k)}
   }
  }
  return changed;
 }

 // Select between the user-reference traced shoreline and a genuine but low-resolution GSHHG coastline.
 setCoastMode(mode){
  if(!['reference','gshhg','osm'].includes(mode))return false;
  if(mode==='osm'&&!this.geoPack?.coast)return false;
  if(this.coastMode===mode)return true;
  this.coastMode=mode;this.invalidateTerrain();return true;
 }
 getRegionName(x){return x<-60?'Керчь / Крым':x<52?'Остров и коса Тузла':'Таманский берег'}
 /** Import a fully local geopack prepared from raw OSM coastline ways and Copernicus GLO-30. */
 loadGeoPack(data){
  const pack=parseGeoPack(data);
  if(Math.abs(pack.sceneSize-this.worldSize)>1)throw Error('GeoPack создан для сцены '+pack.sceneSize+' ед., текущая сцена '+this.worldSize+' ед.');
  this.geoPack=pack;this.geoPackSource=data;this.demEnabled=!!pack.dem;
  if(pack.coast)this.coastMode='osm';
  this.invalidateTerrain();
  return {grid:pack.gridSize,osm:!!pack.coast,dem:!!pack.dem,source:pack.metadata};
 }
 clearGeoPack(){
  this.geoPack=null;this.geoPackSource=null;this.demEnabled=false;
  if(this.coastMode==='osm')this.coastMode='reference';
  this.invalidateTerrain();
 }
 setDEMEnabled(enabled){
  if(enabled&&!this.geoPack?.dem)return false;
  if(this.demEnabled===!!enabled)return true;
  this.demEnabled=!!enabled;this.invalidateTerrain();return true;
 }
 sampleDEMMetres(x,z){return this.demEnabled?sampleDem(this.geoPack,x,z):null}

 // Accept exported WGS84 GeoJSON land polygons from a user's GIS source.
 // This is an optional external data import; no unverifiable GIS is bundled.
 loadGeoJSON(fc){
  const features=fc?.type==='FeatureCollection'?fc.features:[fc?.type==='Feature'?fc:{geometry:fc}];
  if(!Array.isArray(features))throw Error('GeoJSON должен быть FeatureCollection или Polygon');
  const polygons=[];
  let total=0;
  for(const f of features){
   const geometry=f?.geometry||f;
   if(!geometry)continue;
   const collections=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
   for(const poly of collections){
    const rings=[];
    for(const input of poly){
     if(!Array.isArray(input))continue;
     const ring=[];
     const stride=Math.max(1,Math.ceil(input.length/3000));
     for(let i=0;i<input.length;i+=stride){
      const q=input[i];if(!Array.isArray(q)||!Number.isFinite(q[0])||!Number.isFinite(q[1]))continue;
      if(q[0]<-180||q[0]>180||q[1]<-90||q[1]>90)continue;
      const p=geoToScene(q[1],q[0]);ring.push([p.x,p.z]);
     }
     if(ring.length>=3)rings.push(ring);
     total+=ring.length;
     if(total>60000)throw Error('Слишком сложная геометрия (более 60 000 точек)');
    }
    if(rings.length)polygons.push(rings);
   }
  }
  if(!polygons.length)throw Error('В файле нет полигонов суши Polygon / MultiPolygon');
  const n=256,mask=new Uint8Array(n*n),half=this.worldSize*.5;
  const inside=(x,z,ring)=>{
   let result=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
   }
   return result;
  };
  const pixel=(p)=>[Math.floor((p[0]+half)/this.worldSize*n),Math.floor((p[1]+half)/this.worldSize*n)];
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const poly of polygons){
   for(const ring of poly)for(const p of ring){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}
   const xs=poly[0].map(p=>p[0]),zs=poly[0].map(p=>p[1]);
   const a=Math.max(0,Math.floor((Math.min(...xs)+half)/this.worldSize*n)),b=Math.min(n-1,Math.ceil((Math.max(...xs)+half)/this.worldSize*n));
   const c=Math.max(0,Math.floor((Math.min(...zs)+half)/this.worldSize*n)),d=Math.min(n-1,Math.ceil((Math.max(...zs)+half)/this.worldSize*n));
   for(let iz=c;iz<=d;iz++)for(let ix=a;ix<=b;ix++){
    const x=((ix+.5)/n-.5)*this.worldSize,z=((iz+.5)/n-.5)*this.worldSize;
    if(inside(x,z,poly[0])&&!poly.slice(1).some(hole=>inside(x,z,hole)))mask[iz*n+ix]=255;
   }
  }
  this.gisMask=mask;this.gisLandFeatures=polygons.length;
  this.gisBounds={minX,maxX,minZ,maxZ};
  this.clearTerrainChunks();this.sceneDirty=true;this.coastDirty=true;
  return {polygons:polygons.length,points:total,resolution:n};
 }
 sampleLandMask(x,z){
  if(!this.gisMask||!this.gisBounds)return null;
  const b=this.gisBounds,margin=this.worldSize/256;
  if(x<b.minX-margin||x>b.maxX+margin||z<b.minZ-margin||z>b.maxZ+margin)return null;
  const n=256,ix=wClamp(Math.floor((x/this.worldSize+.5)*n),0,n-1),iz=wClamp(Math.floor((z/this.worldSize+.5)*n),0,n-1);
  return this.gisMask[iz*n+ix]?1:0;
 }
 mapHeightBase(x,z){
 // The full plateau now contains curved, different western/eastern banks.
 const crimeaEdge=coastShore(z,CRIMEA_COAST)+shoreNoise(-150,z);
 const tamanEdge=coastShore(z,TAMAN_COAST)+shoreNoise(145,z)*.92;
 const shelf=(v)=>1/(1+Math.exp(wClamp(v*.24,-45,45)));
 const crimea=shelf(x-crimeaEdge),taman=shelf(tamanEdge-x);
 const imported=this.sampleLandMask(x,z);
 const geo=imported===null?(this.coastMode==='osm'&&this.geoPack?.coast?sampleCoast(this.geoPack,x,z):this.coastMode==='gshhg'?sampleGshhgLand(x,z,this.worldSize):sampleGeoLand(x,z,this.worldSize)):imported;
 // Fine island / spit silhouette supplements the overview-based coastline mask.
 const axis=this.kerchBaseCenter(x)-1.8*Math.exp(-Math.pow((x+30)/48,2));
 const tip=Math.exp(-Math.pow((x+13)/58,4)-Math.pow((z-axis)/6.0,4));
 const westSpit=Math.exp(-Math.pow((x+78)/33,4)-Math.pow((z-axis-2.4)/2.6,4));
 const eastSpit=Math.exp(-Math.pow((x-57)/33,4)-Math.pow((z-axis+2.0)/2.9,4));
 const island=Math.max(tip*.89,westSpit*.68,eastSpit*.65);
 // Coast source: user-image-derived trace (default) or GSHHG intermediate raster; neither provides DEM elevations.
 // When verified external polygons or the OSM mask are loaded, do not overlay a made-up Tuzla silhouette.
 const useExternal=(imported!==null)||(this.coastMode==='osm'&&!!this.geoPack?.coast);
 const coastLand=useExternal?geo:Math.max(geo,island);
 const terrainNoise=.20*Math.sin(x*.041+z*.013)*Math.cos(z*.047)+.13*Math.sin(x*.097-z*.057)+.06*Math.cos(z*.23);
 const cliff=(.24+.48*Math.pow(Math.sin((x+z)*.011),2))*geo;
 let base=-2.80+5.78*coastLand+terrainNoise*coastLand+cliff;
 // Open water navigational channel remains clear of the arch region.
 const channel=Math.exp(-Math.pow((x+70)/24,4)-Math.pow((z-this.kerchBaseCenter(x))/13.2,4));
 if(!useExternal)base-=3.4*channel;
 // DSM heights are in metres. Here vertical units are exaggerated for legible gameplay;
 // this does NOT convert a schematic bridge into a surveyed 1:1 engineering model.
 const heightM=this.sampleDEMMetres(x,z);
 if(heightM!==null&&coastLand>.10){
  const sceneHeight=Math.max(-1.35,Math.min(45,heightM/this.demMetresPerUnit-.38));
  const t=wClamp((coastLand-.10)/.72,0,1);
  base=base*(1-t)+sceneHeight*t;
 }
 // The editable delta field is the same input that both 2D and 3D reference.
 let a=(x/this.worldSize+.5)*64,b=(z/this.worldSize+.5)*64,i=wClamp(Math.floor(a),0,63),j=wClamp(Math.floor(b),0,63),u=wClamp(a-i,0,1),v=wClamp(b-j,0,1),t=this.mapEdit,H=(ix,iz)=>t[iz*65+ix];
 let terrain=base+((H(i,j)*(1-u)+H(i+1,j)*u)*(1-v)+(H(i,j+1)*(1-u)+H(i+1,j+1)*u)*v);
 return terrain;
 }
 /** GeoEarthworks 11.3 — adaptive engineering earthworks. Real DEM is immutable.
     A compact roadbed, shaped verge and depth-dependent cut/fill daylight slope
     replace the previous fixed-width rectangular excavation. Values are
     visual/model parameters, not measured design slopes for the real bridge. */
 earthworkAt(x,z,side,sourceHeight){
  const bounds=this.kerchBounds(),isRoad=side===bounds.roadSide;
  const deckHalf=isRoad?2.28:1.78;
  const d=Math.abs(z-this.trackCenter(x,side));
  const core=deckHalf+(isRoad?1.08:1.22); // paved / gravelled verge
  const onBridge=x>=bounds.x0&&x<=bounds.x1;
  const grade=onBridge?this.plannedBridgeDeck(x,isRoad):this.landApproachElevation(x,side);
  let target,desired,kind='none',maxDiff=0;
  if(onBridge){
   // Keep bridges open; no fictional embankment beneath arches or in water.
   target=grade-1.90;
   desired=Math.min(sourceHeight,target);
  }else{
   const edge=x<bounds.x0?bounds.x0:bounds.x1;
   const approach=wClamp(Math.abs(x-edge)/11,0,1);
   const smooth=approach*approach*(3-2*approach);
   target=(this.plannedBridgeDeck(edge,isRoad)-1.90)*(1-smooth)+(grade-.46)*smooth;
   if(sourceHeight>target){desired=target;kind='cut';}
   else if(sourceHeight>-1.43){
    desired=Math.min(target,sourceHeight+2.7);kind='fill';
   }else{desired=sourceHeight;kind='water';}
  }
  maxDiff=Math.abs(sourceHeight-desired);
  // The excavation's lateral extent depends on its *depth*: approximately
  // 1.45 horizontal : 1 vertical in cuts, 2.1 : 1 in shallow fills.
  // Smooth local convexity eliminates the razor-straight channel lip.
  const runout=wClamp(2.9+maxDiff*(kind==='fill'?2.10:1.45),3.0,16);
  const outer=core+runout;
  let weight=d<=core?1:d>=outer?0:(outer-d)/runout;
  weight=weight*weight*(3-2*weight);
  const shaped=sourceHeight+(desired-sourceHeight)*weight;
  return {height:shaped,source:sourceHeight,grade,desired,target,kind,weight,core,outer,d,depth:maxDiff,onBridge};
 }
 mapHeight(x,z){
  const original=this.mapHeightBase(x,z),bounds=this.kerchBounds();
  if(x< -207.1||x>207.1)return original;
  let result=original;
  // Both corridors are independent. For intersecting transition slopes use
  // the lower excavation; never let a neighbouring fill bury a carriageway.
  for(const side of [bounds.roadSide,bounds.railSide]){
   const shape=this.earthworkAt(x,z,side,original);
   if(shape.weight<=0)continue;
   if(shape.height<result)result=shape.height;
   else if(shape.kind==='fill'&&result<=original+1e-6)result=shape.height;
  }
  // A final exact roadbed constraint protects both deck footprints even
  // when one berm overlaps the neighbouring road or rail cutting.
  for(const side of [bounds.roadSide,bounds.railSide]){
   const d=Math.abs(z-this.trackCenter(x,side));
   if(d>=(side===bounds.roadSide?2.28:1.78)+.10)continue;
   const shape=this.earthworkAt(x,z,side,original);
   if(shape.onBridge||shape.kind!=='water')result=Math.min(result,shape.grade-.38);
  }
  return result;
 }
 /** GeoEarthworks Inspector 11.4. All distances are illustrative game units,
     NOT construction volumes or geodetic quantities. This report is read-only
     and cannot change the original Copernicus DSM. */
 earthworkReport(step=2.4){
  const b=this.kerchBounds(),result={};
  for(const [name,side] of [['road',b.roadSide],['rail',b.railSide]]){
   const r={cutLength:0,fillLength:0,waterLength:0,peakCut:0,peakFill:0,samples:0};
   for(const [a,c] of [[-206,b.x0],[b.x1,206]]){
    const n=Math.max(1,Math.ceil(Math.abs(c-a)/step)),dx=Math.abs(c-a)/n;
    for(let i=0;i<n;i++){
     const x=a+(c-a)*(i+.5)/n,z=this.trackCenter(x,side),original=this.mapHeightBase(x,z);
     const altered=this.mapHeight(x,z),diff=original-altered;r.samples++;
     if(original<=-1.43){r.waterLength+=dx;continue;}
     if(diff>.16){r.cutLength+=dx;r.peakCut=Math.max(r.peakCut,diff);}
     else if(diff<-.16){r.fillLength+=dx;r.peakFill=Math.max(r.peakFill,-diff);}
    }
   }
   result[name]=r;
  }
  return result;
 }
 /** v11.6: independent 2D cross-section through engineered cut / fill.
     Read-only diagnostics: sampling must never mutate DSM or grade profiles. */
 earthworkCrossSection(x,side,halfSpan=17,step=.55){
  const b=this.kerchBounds(),road=side===b.roadSide;
  x=wClamp(x,-206,206);halfSpan=wClamp(halfSpan,5,32);step=wClamp(step,.25,3);
  const zc=this.trackCenter(x,side),grade=this.landApproachElevation(x,side);
  const n=Math.ceil(halfSpan*2/step),samples=[];let minClearance=Infinity,peakCut=0,peakFill=0;
  for(let i=0;i<=n;i++){
   const offset=-halfSpan+i*2*halfSpan/n,z=zc+offset;
   const original=this.mapHeightBase(x,z),modified=this.mapHeight(x,z);
   const land=original>-1.43;
   samples.push({offset,z,original,modified,land});
   if(Math.abs(offset)<=(road?2.28:1.78))minClearance=Math.min(minClearance,grade-modified);
   if(land){peakCut=Math.max(peakCut,original-modified);peakFill=Math.max(peakFill,modified-original);}
  }
  return {x,side,mode:road?'road':'rail',grade,centerZ:zc,minClearance,peakCut,peakFill,samples};
 }
 /** v12.0: switch the direct-light shading model without re-uploading terrain. */
 setRenderCore({ggx,roughness}={}){
  if(ggx!==undefined)this.ggxEnabled=!!ggx;
  if(roughness!==undefined){if(!Number.isFinite(roughness))throw Error('Non-finite roughness');this.materialRoughness=wClamp(roughness,.55,1.65);}
  return {ggx:this.ggxEnabled,roughness:this.materialRoughness};
 }
 getMaterialDescriptor(mat){return rendercoreDescriptor(mat);}
 /** v11.9: tone controls can be changed without uploading static meshes. */
 setAtmosphereGrade(saturation,fog){
  if(!Number.isFinite(saturation)||!Number.isFinite(fog))throw Error('Invalid atmosphere values');
  this.materialSaturation=wClamp(saturation,.55,1.45);this.fogDensity=wClamp(fog,.30,2.0);
  return {saturation:this.materialSaturation,fog:this.fogDensity};
 }
 /** v11.8: live CPU/GPU workload accounting, independent of the active mode.
     These are vertex/buffer estimates, not hardware timings. */
 performanceSnapshot(){
  const vertices=this.mesh.a.length/7,buildings=this.buildingMesh.a.length/7,traffic=this.trafficMesh.a.length/7;
  return {fps:this.stats.fps||0,staticBuilds:this.staticBuilds,trafficUpdates:this.trafficUpdates,
   staticTriangles:vertices/3,buildingTriangles:buildings/3,trafficTriangles:traffic/3,
   meshMiB:(vertices+buildings+traffic)*7*4/(1024*1024),
   terrainChunks:this.chunksVisible,terrainCache:this.chunkCache.size,
   bridgeStaticDirty:this.sceneDirty,terrainCacheDirty:this.bufferDirty,
   renderer:this.software?'CPU 2.5D':'WebGL 1'};
 }
 /** v11.7: fast, read-only four-approach quality check. These are GAME units.
     It detects underpasses and grades in the current mesh, not structural safety. */
 inspectAllApproaches(step=3.0){
  const b=this.kerchBounds(),report={version:'11.7',sampleStep:step,sections:[],warnings:[]};
  for(const [mode,side,half] of [['road',b.roadSide,2.28],['rail',b.railSide,1.78]]){
   for(const [shore,a,c] of [['kerch',-205,b.x0-.3],['taman',b.x1+.3,205]]){
    const n=Math.max(1,Math.ceil((c-a)/step)),r={mode,shore,samples:0,land:0,water:0,minClearance:Infinity,maxSlope:0,peakCut:0,peakFill:0,warningPoints:[]};
    let last=null;
    for(let i=0;i<=n;i++){
     const x=a+(c-a)*i/n,z=this.trackCenter(x,side),grade=this.landApproachElevation(x,side),base=this.mapHeightBase(x,z);
     if(last)r.maxSlope=Math.max(r.maxSlope,Math.abs((grade-last.y)/(x-last.x)));
     last={x,y:grade};r.samples++;
     if(base<=-1.43){r.water++;continue;}r.land++;
     r.peakCut=Math.max(r.peakCut,base-this.mapHeight(x,z));r.peakFill=Math.max(r.peakFill,this.mapHeight(x,z)-base);
     for(const dz of [-half,0,half]){
      const clearance=grade-this.mapHeight(x,z+dz);r.minClearance=Math.min(r.minClearance,clearance);
      if(clearance<.28)r.warningPoints.push({x:+x.toFixed(1),dz,clearance:+clearance.toFixed(2)});
     }
    }
    if(r.land===0)r.minClearance=null;
    if(r.warningPoints.length)report.warnings.push(`${mode}/${shore}: ${r.warningPoints.length} потенциальных перекрытий`);
    if(r.maxSlope>(mode==='road'?.205:.11))report.warnings.push(`${mode}/${shore}: предельный уклон превышен`);
    report.sections.push(r);
   }
  }
  return report;
 }
 /** Subdivide coarse terrain cells close to the road and the railway.
     Otherwise 8m-wide DEM triangles can cross over even a correctly graded
     roadbed and visually bury the road despite valid centreline clearance. */
 cellNearBridgeCorridor(x0,x1,z0,z1){
  if(x1< -208||x0>208)return false;
  const mid=(x0+x1)*.5,b=this.kerchBounds();
  for(const side of [b.roadSide,b.railSide]){
   let lo=Infinity,hi=-Infinity;
   for(const x of [x0,mid,x1]){const v=this.trackCenter(x,side);lo=Math.min(lo,v);hi=Math.max(hi,v);}
   if(z1>=lo-11&&z0<=hi+11)return true;
  }
  return false;
 }

 addHouse(m,s){let f=s.foundation,L=f.length,W=f.width,gy=this.sample(0,0);let y=gy+.16,wallHeight=2.75+Math.min(5,f.floors)*1.55;
 // footing, concrete edge, piles, slab with bases under terrain
 if(f.type==='raft')m.box(0,gy-.36,0,L+.85,.65,W+.85,4);
 if(f.type==='strip'){for(let z of [-W/2+.35,W/2-.35])m.box(0,gy-.65,z,L+.6,1.2,.65,4);for(let x of [-L/2+.35,L/2-.35])m.box(x,gy-.65,0,.7,1.2,W,4)}
 if(f.type==='pad'){for(let x of [-L/2+.6,L/2-.6])for(let z of [-W/2+.6,W/2-.6])m.box(x,gy-.6,z,1.8,1,1.8,4)}
 if(['piles','screw'].includes(f.type)){m.box(0,gy-.24,0,L+.4,.48,W+.4,4);let count=Math.min(36,Math.max(4,Math.floor(f.pileCount))),cols=Math.max(2,Math.ceil(Math.sqrt(count*L/W))),rows=Math.ceil(count/cols);for(let i=0;i<count;i++){let x=-L/2+.7+(i%cols)*(L-1.4)/Math.max(1,cols-1),z=-W/2+.7+Math.floor(i/cols)*(W-1.4)/Math.max(1,rows-1);m.tube([x,gy-2.8,z],[x,gy,z],f.type==='screw'?.13:.19,f.type==='screw'?5:4,7)}}
 m.box(0,y,0,L,wallHeight,W,10);
 // roof proper topology - two faces meet at ridge, depth testing prevents the previously inverted overlapping faces
 m.roof(0,y+wallHeight,0,L,W,2.35,8);
 // facade details
 let n=Math.max(2,Math.floor(L/3));for(let floor=0;floor<f.floors;floor++){let py=y+1.2+floor*1.65;for(let i=0;i<n;i++){let x=-L/2+(i+.5)*L/n;m.box(x,py,-W/2-.065,.9,1.08,.07,14);m.box(x,py,W/2+.065,.9,1.08,.07,14);m.box(x,py+.51,-W/2-.12,1.05,.10,.16,4);m.box(x,py+.51,W/2+.12,1.05,.10,.16,4)}for(let z of [-W/4,W/4]){m.box(-L/2-.06,py,z,.09,1.08,.85,14);m.box(L/2+.06,py,z,.09,1.08,.85,14)}}
 // door + porch at front
 m.box(0,y-.02,-W/2-.12,1.3,2.2,.14,7);m.box(0,gy-.2,-W/2-1.6,2.6,.2,2.0,4);
 // vegetation and paths outside footprint
 for(let i=0;i<17;i++){let xx=Math.sin(i*5.1)*24,zz=Math.cos(i*3.7)*22;if(Math.abs(xx)<L/2+3&&Math.abs(zz)<W/2+3)continue;let yy=this.sample(xx,zz);this.tree(m,xx,yy,zz,.75+(i%4)*.18)}
 // paving and access road
 m.box(0,gy-.06,-W/2-7,3.1,.10,10.5,3);
 }
 tree(m,x,y,z,s=1){m.tube([x,y,z],[x,y+s*2.5,z],s*.13,2,5);for(let i=0;i<3;i++){let yy=y+1.4*s+i*.7*s,rr=(1.25-i*.2)*s;m.tube([x,yy-.5*s,z],[x,yy+1.0*s,z],rr*(i===2?.58:.77),15,7)}}
 roadSegment(m,a,b,width=.7,rail=false){let dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz),ux=dx/l,uz=dz/l,nx=-uz,nz=ux;let q=(p,side,height=0)=>[p[0]+nx*side,p[1]+height,p[2]+nz*side];m.quad(q(a,-width/2),q(b,-width/2),q(b,width/2),q(a,width/2),rail?4:3);if(!rail){let a1=q(a,0,.05),b1=q(b,0,.05);m.tube(a1,b1,.028,16,4);for(let side of [-1,1])m.tube(q(a,side*width*.56,.19),q(b,side*width*.56,.19),.038,5,5);let count=Math.max(1,Math.floor(l/1.8));for(let i=0;i<=count;i++){let t=i/count,p=add(scale(a,1-t),scale(b,t));m.box(p[0],p[1]+.03,p[2],.28,.04,.11,16)}}else{for(let side of [-.22,.22])m.tube(q(a,side,.09),q(b,side,.09),.036,5,5);let count=Math.max(1,Math.floor(l/.92));for(let i=0;i<=count;i++){let t=i/count,p=add(scale(a,1-t),scale(b,t));m.tube(q(p,-.38,.02),q(p,.38,.02),.043,7,4)}}}
arch(m,x0,x1,z,deckY,h=8,mat=18){let count=36,sideW=1.62;for(let side of [-sideW,sideW]){let prev=null;for(let i=0;i<=count;i++){let t=i/count,x=x0+(x1-x0)*t,y=deckY+1.25+h*Math.sin(t*Math.PI),cur=[x,y,z+side];if(prev)m.tube(prev,cur,.20,mat,7);prev=cur;m.tube([x,deckY+.2,z+side],cur,.055,18,5)}for(let i=0;i<=count;i+=6){let t=i/count,x=x0+(x1-x0)*t,y=deckY+1.25+h*Math.sin(t*Math.PI);m.tube([x,y,z-sideW],[x,y,z+sideW],.08,18,5)}}}
kerchBounds(){return {x0:this.routeExtents.x0,x1:this.routeExtents.x1,roadSide:-4.05,railSide:4.10,archA:-84,archB:-56}}
 /** Bring a surveyed or OSM-exported centreline into the same WGS84 frame as GeoPack. */
 loadRouteGeoJSON(data){
  const parsed=parseRouteGeoJSON(data,geoToScene,this.kerchBounds());
  this.geoRoute=parsed;this.geoRouteSource=data;this.invalidateTerrain();
  return parsed.information;
 }
 clearRouteGeoJSON(){this.geoRoute=null;this.geoRouteSource=null;this.invalidateTerrain()}
 /** A single coherent longitudinal axis; track-specific lines can override it. */
 kerchBaseWithGeo(x){
  const b=this.kerchBounds(),base=this.kerchBaseCenter(x),g=this.geoRoute;
  if(!g)return base;
  if(g.center)return sampleRouteLine(g.center,x,base);
  const road=g.road?sampleRouteLine(g.road,x,base+b.roadSide)-(b.roadSide):null;
  const rail=g.rail?sampleRouteLine(g.rail,x,base+b.railSide)-(b.railSide):null;
  return road!==null&&rail!==null?(road+rail)*.5:road??rail??base;
 }
 trackCenter(x,side){
  const b=this.kerchBounds(),g=this.geoRoute,offset=this.routeOffset(x),base=this.kerchBaseWithGeo(x);
  if(g){
   if(Math.abs(side-b.roadSide)<.25&&g.road)return sampleRouteLine(g.road,x,base+b.roadSide)+offset;
   if(Math.abs(side-b.railSide)<.25&&g.rail)return sampleRouteLine(g.rail,x,base+b.railSide)+offset;
  }
  return base+side+offset;
 }
 /**
  * Shoreline QA is a classification check, not a route fit. In particular, 0
  * intersections + 0% land means the sampled route is entirely in the water
  * (or outside the grid). Distinguish those cases before suggesting a fix.
  */
 routeCoastDiagnostics({detail=false}={}){
  if(!this.geoPack?.coast)return {ok:false,reason:'Сначала загрузите GeoPack с береговой маской OSM.'};
  const b=this.kerchBounds(),count=512,pack=this.geoPack,n=pack.gridSize;
  const result={ok:true,source:this.geoRoute?'импортированная ось GeoJSON':'УСЛОВНАЯ ось 9.4',
   tracks:{},crossings:[],calibration:'WGS84≈ / одна опорная точка',grid:n,sceneSize:pack.sceneSize};
  let globalLand=0;
  for(const val of pack.coast)if(val>127)globalLand++;
  result.globalLandPercent=Math.round(globalLand/pack.coast.length*1000)/10;
  // Distance is computed only for an explicit detailed check; the lightweight
  // variant is used during 2D drag/redraw to avoid frame-rate regressions.
  const closestLand=(x,z)=>{
   const size=pack.sceneSize,step=size/n,half=size/2,arr=pack.coast;
   let best=Infinity,point=null;
   for(let j=0;j<n;j++){
    const zz=-half+(j+.5)*step,dz=zz-z;
    if(dz*dz>=best)continue;
    for(let i=0;i<n;i++){
     if(arr[j*n+i]<=127)continue;
     const xx=-half+(i+.5)*step,dx=xx-x,d2=dx*dx+dz*dz;
     if(d2<best){best=d2;point={x:xx,z:zz};}
    }
   }
   return point?{km:Math.round(Math.sqrt(best)*.08*100)/100,point,geo:sceneToGeo(point.x,point.z)}:null;
  };
  for(const [name,side] of [['road',b.roadSide],['rail',b.railSide]]){
   let land=0,water=0,outside=0,previous=null,cross=[],samples=[];
   let start=null,end=null;
   for(let i=0;i<=count;i++){
    const x=b.x0+(b.x1-b.x0)*i/count,z=this.trackCenter(x,side),v=sampleCoast(pack,x,z);
    const cls=v===null?null:v>.5;
    if(i===0)start={x,z,geo:sceneToGeo(x,z),land:cls};
    if(i===count)end={x,z,geo:sceneToGeo(x,z),land:cls};
    if(cls===null){outside++;previous=null;continue;}
    if(cls)land++;else water++;
    if(previous!==null&&cls!==previous){const gps=sceneToGeo(x,z);cross.push({x,z,lat:gps.lat,lon:gps.lon,km:Math.round((x-b.x0)*.08*100)/100});}
    previous=cls;
    if(i%16===0||i===count)samples.push({x,z,land:cls});
   }
   const valid=land+water;
   let reason=valid===0?'Маршрут целиком за пределами GeoPack.':
    land===0?'Все проверенные точки оси находятся в воде.':
    water===0?'Все проверенные точки оси находятся на суше.':
    'Вдоль оси есть и суша, и вода.';
   const stats={landPercent:valid?Math.round(land/valid*100):null,
    shoreCrossings:cross.length,startLand:start.land,endLand:end.land,
    landSamples:land,waterSamples:water,outsideSamples:outside,validSamples:valid,
    reason,start,end,samples};
   if(detail){
    stats.nearestLandStart=start.land===false?closestLand(start.x,start.z):null;
    stats.nearestLandEnd=end.land===false?closestLand(end.x,end.z):null;
   }
   result.tracks[name]=stats;
   result.crossings.push(...cross.map(c=>({...c,track:name})));
  }
  return result;
 }
 /** Export lines as ordinary WGS84 GeoJSON for inspection/editing in QGIS. */
 exportRouteGeoJSON(){
  const b=this.kerchBounds();
  return {type:'FeatureCollection',name:'TrussLab 9.4 route (approximate map datum)',
   metadata:{warning:'Game geometry. Approximate geographic transform; NOT as-built survey.',geopackLoaded:!!this.geoPack?.coast},
   features:[['road',b.roadSide],['rail',b.railSide]].map(([mode,side])=>({type:'Feature',properties:{mode,source:this.geoRoute?'user GeoJSON + edits':'illustrative TrussLab geometry',bridge:'Kerch crossing'},geometry:{type:'LineString',coordinates:Array.from({length:237},(_,i)=>{const x=b.x0+(b.x1-b.x0)*i/236,z=this.trackCenter(x,side),p=sceneToGeo(x,z);return [+p.lon.toFixed(7),+p.lat.toFixed(7)]})}}))};
 }
 /** The model approach extents, NOT mapped road endpoints or as-built surveying. */
 setRouteExtents(extents){
  const a=Number(extents?.x0),b=Number(extents?.x1);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a> -95||b<95||a< -205||b>205||b-a<205)return false;
  if(a===this.routeExtents.x0&&b===this.routeExtents.x1)return true;
  this.routeExtents={x0:a,x1:b};this.invalidateTerrain();return true;
 }
 resetRouteExtents(){return this.setRouteExtents({x0:-118,x1:118});}
 /** Preview only: scan both lanes from each terminal outward until both are
  * continuously over land, rather than snapping to a stray coastline pixel.
  * This changes game APPROACH lengths only; GIS layers are never modified. */
 proposeCoastalExtensions({step=.5,stableMetres=320,maxExtensionMetres=4800}={}){
  if(!this.map||!this.geoPack?.coast)return {ok:false,reason:'Загрузите GeoPack с береговой маской OSM.'};
  if(this.geoRoute)return {ok:false,reason:'Загружены оси GeoJSON; изменять их по маске без проверки координат нельзя.'};
  const b=this.kerchBounds(),size=this.geoPack.sceneSize,half=Math.min(this.worldSize/2,size/2)-2;
  const need=Math.max(4,Math.ceil(stableMetres/(step*80))),maxSteps=Math.ceil(maxExtensionMetres/(step*80));
  const bothLand=(x)=>{
   const v1=sampleCoast(this.geoPack,x,this.trackCenter(x,b.roadSide));
   const v2=sampleCoast(this.geoPack,x,this.trackCenter(x,b.railSide));
   return v1!==null&&v2!==null&&v1>.70&&v2>.70;
  };
  if(bothLand(b.x0)&&bothLand(b.x1))return {ok:false,reason:'Оба конца игровых подходов уже на суше.'};
  const search=(start,direction)=>{
   if(bothLand(start))return {x:start,firstLand:start,extensionKm:0,runMetres:0};
   let run=0,first=null;
   for(let k=1;k<=maxSteps;k++){
    const x=start+direction*k*step;
    if(Math.abs(x)>half)break;
    if(bothLand(x)){
     if(run===0)first=x;
     if(++run>=need)return {x,firstLand:first,extensionKm:Math.abs(x-start)*.08,runMetres:run*step*80};
    }else{run=0;first=null;}
   }
   return null;
  };
  const left=search(b.x0,-1),right=search(b.x1,1);
  if(!left||!right)return {ok:false,reason:'Не обнаружена устойчивая суша вдоль обеих условных осей. '+
     (!left?'Крымский подход не найден. ':'')+(!right?'Таманский подход не найден. ':'')+
     'Требуется проверить направление маршрута и GeoPack, а не сдвигать берег.',left,right};
  return {ok:true,x0:left.x,x1:right.x,left,right,
    beforeKm:this.routeLengthKm(),estimatedLengthKm:(right.x-left.x)*.08,
    disclaimer:'Только визуальное продолжение подходов по маске; не GPS-координаты моста.'};
 }
 applyCoastalExtensions(plan){
  if(!plan?.ok)return false;
  const fresh=this.proposeCoastalExtensions();
  if(!fresh.ok||Math.abs(fresh.x0-plan.x0)>.51||Math.abs(fresh.x1-plan.x1)>.51)return false;
  return this.setRouteExtents(fresh);
 }
// Shared horizontal alignment used by 2D route editor, 3D road/rail,
// piers, and the minimap. Only the visual alignment is editable here.
 routeOffset(x){
  const b=this.kerchBounds(),v=this.routeOffsets,n=v.length-1;
  const q=wClamp((x-b.x0)/(b.x1-b.x0)*n,0,n),i=Math.min(n-1,Math.floor(q)),t=q-i;
  const p0=v[Math.max(0,i-1)],p1=v[i],p2=v[i+1],p3=v[Math.min(n,i+2)];
  const t2=t*t,t3=t2*t;
  return wClamp(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3),-85,85);
 }
 routeLengthKm(){
  const b=this.kerchBounds(),steps=280;let distance=0,prev=[b.x0,this.kerchCenter(b.x0)];
  for(let i=1;i<=steps;i++){const x=b.x0+(b.x1-b.x0)*i/steps,z=this.kerchCenter(x);distance+=Math.hypot(x-prev[0],z-prev[1]);prev=[x,z]}
  return distance*.08; // 80 metres per one illustrative scene unit
 }
 getRouteControls(){
  const b=this.kerchBounds();
  return this.routeOffsets.map((offset,i)=>{
   const x=b.x0+(b.x1-b.x0)*i/(this.routeOffsets.length-1);
   return {x,z:this.kerchCenter(x),offset,locked:false};
  });
 }
 setRouteOffset(index,offset){
  if(!Number.isInteger(index)||index<0||index>=this.routeOffsets.length||!Number.isFinite(offset))return false;
  const value=wClamp(offset,-80,80);
  if(value===this.routeOffsets[index])return false;
  this.routeOffsets[index]=value;this.invalidateTerrain();return true;
 }
 setRouteOffsets(values){
  if(!Array.isArray(values)||values.length!==this.routeOffsets.length||!values.every(Number.isFinite))return false;
  this.routeOffsets=values.map(v=>wClamp(v,-80,80));
  this.invalidateTerrain();return true;
 }
 resetRoute(){this.setRouteOffsets(new Array(this.routeOffsets.length).fill(0));}
 invalidateTerrain(){this.approachProfileCache?.clear();this.clearCityTiles();this.buildingMeshDirty=true;this.buildingBufferDirty=true;this.sceneDirty=true;this.bufferDirty=true;this.shadowDirty=true;this.coastDirty=true;this.clearTerrainChunks();}
 kerchBaseCenter(x){return -3.2+5.0*Math.sin((x+30)*.024)+1.35*Math.sin(x*.062)}
 kerchCenter(x){return this.kerchBaseWithGeo(x)+this.routeOffset(x)}
plannedBridgeDeck(x,isRoad){
 const b=this.kerchBounds(),ramp=isRoad?this.roadRamp:this.railRamp;
 const smooth=t=>{t=wClamp(t,0,1);return t*t*(3-2*t)};
 const progress=x<b.archA?smooth((x-(b.archA-ramp))/ramp):x>b.archB?smooth(((b.archB+ramp)-x)/ramp):1;
 return this.deckBaseLevel+(this.archDeckLevel-this.deckBaseLevel)*progress+this.kerchDeckEdit(x);
}
kerchDeck(x,z){
 // Continuous mathematical grade, independent of terrain's pixel-like noise.
 // The road is intentionally shorter/steeper than the rail approach; both
 // arch stretches meet the same game datum. This is not an as-built profile.
 const b=this.kerchBounds();return this.plannedBridgeDeck(x,Math.abs(z-this.trackCenter(x,b.roadSide))<=Math.abs(z-this.trackCenter(x,b.railSide)));
}
kerchSample(x,side){let z=this.trackCenter(x,side);return [x,this.kerchDeck(x,z),z]}
// Inspired by public photographic references: two plated bow-string ribs per passage,
// dense hangers and transverse lattice. An original game asset, NOT as-built geometry.
archAssembly(m,x0,x1,offset,wide,high,rail=false){
 const N=this.software?28:this.quality==='ultra'?96:this.quality==='high'?72:this.quality==='medium'?48:32;
 const ribSides=[-wide/2,wide/2],topPrev=[null,null],bottomPrev=[null,null],portalEvery=this.quality==='ultra'?4:6;
 let lastPortal=null;
 for(let i=0;i<=N;i++){
  let t=i/N,x=x0+(x1-x0)*t,loc=this.kerchSample(x,offset),z=loc[2],deck=loc[1];
  // A flat parabolic arch silhouette like the photos; not a precise arch profile.
  let lift=high*4*t*(1-t),yTop=deck+.39+lift,yLow=yTop-(.27+.10*Math.sin(Math.PI*t));
  for(let side=0;side<2;side++){
   const rz=z+ribSides[side],top=[x,yTop,rz],low=[x,yLow,rz],base=[x,deck+.25,rz];
   if(topPrev[side]){
    m.prismBetween(topPrev[side],top,.23,rail?.32:.40,18);
    m.prismBetween(bottomPrev[side],low,.16,rail?.30:.37,18);
    m.prismBetween(add(topPrev[side],[0,.13,0]),add(top,[0,.13,0]),.035,rail?.41:.48,20);
    if(i%2===0){
     m.tube(bottomPrev[side],top,.045,18,5);
     m.tube(topPrev[side],low,.041,18,5);
    }
   }
   // Hangers are attached to a wide tie-girder rather than terminating in empty space.
   if(i>0&&i<N&&i%(this.quality==='ultra'?2:3)===0){
    m.tube(base,low,.030,18,6);
    m.box(x,deck+.21,rz,.19,.14,.22,20);
    m.box(x,yLow-.08,rz,.15,.12,.22,20);
   }
   if(i%3===0&&i<N){m.prismBetween([x,deck-.17,rz],[x,deck+.19,rz],.075,.082,18)}
   topPrev[side]=top;bottomPrev[side]=low;
  }
  if(i%portalEvery===0){
   const left=[x,yTop,z+ribSides[0]],right=[x,yTop,z+ribSides[1]];
   m.prismBetween(left,right,.10,.09,18);
   if(lastPortal){
    m.tube(lastPortal[0],right,.045,18,6);
    m.tube(lastPortal[1],left,.045,18,6);
   }
   lastPortal=[left,right];
   m.tube([x,deck+.25,z+ribSides[0]],[x,deck+.25,z+ribSides[1]],.045,20,5);
  }
  // Train approaches contain a visibly triangulated underside.
  if(rail&&i%2===0){
    for(let side=0;side<2;side++){
     let zz=z+ribSides[side],q=[x,deck+.015,zz],low=[x,deck-.48,zz];
     m.tube(q,low,.065,18,6);
     if(i>=2){let px=x-(x1-x0)*2/N,pp=this.kerchSample(px,offset);
       m.tube([px,pp[1]-.48,pp[2]+ribSides[side]],q,.048,18,6);
     }
    }
  }
 }
 // End frames and bearings at both springing points.
 for(let x of [x0,x1]){
  let p=this.kerchSample(x,offset);
  for(let side of ribSides){
   m.box(x,p[1]-.56,p[2]+side,.53,.56,.52,4);
   m.box(x,p[1]+.02,p[2]+side,.32,.19,.43,18);
  }
 }
}
roadRibbon(m,a,b,halfWidth=1.35,rail=false){let dx=b[0]-a[0],dz=b[2]-a[2],L=Math.hypot(dx,dz),nx=-dz/L,nz=dx/L;
 const P=(p,off,height=0)=>[p[0]+nx*off,p[1]+height,p[2]+nz*off];
 let width=halfWidth*2;m.quad(P(a,-halfWidth),P(b,-halfWidth),P(b,halfWidth),P(a,halfWidth),rail?4:3);
 // Concrete girders below the deck, continuous edges and safety barriers.
 for(let side of [-halfWidth,halfWidth]){m.tube(P(a,side,-.25),P(b,side,-.25),.12,4,6);m.tube(P(a,side,.40),P(b,side,.40),.027,18,5)}
 if(rail){
  // Two physically separate track centres, four continuous rails and one sleeper group per track.
  // Widths are illustrative display coordinates, not actual track gauge.
  const centres=[-.69,.69],gauge=.235;
  for(const centre of centres){
   m.quad(P(a,centre-.42,.036),P(b,centre-.42,.036),P(b,centre+.42,.036),P(a,centre+.42,.036),13);
   for(const side of [centre-gauge,centre+gauge]){
    m.prismBetween(P(a,side,.116),P(b,side,.116),.036,.052,5);
   }
   if(Math.floor(a[0]*2.4)%2===0){
    m.prismBetween(P(a,centre-.40,.042),P(a,centre+.40,.042),.047,.086,13);
   }
  }
  m.quad(P(a,-.19,.08),P(b,-.19,.08),P(b,.19,.08),P(a,.19,.08),4);
  for(let side of [-halfWidth+.15,halfWidth-.15])m.tube(P(a,side,.23),P(b,side,.23),.035,18,5);
 }
 else {
  // Four-lane roadway: shoulder lines + lane dividers + centre marking.
  for(let lane of [-1.02,-.34,.34,1.02]){let seg=P(a,lane,.022),seg2=P(b,lane,.022);if(Math.floor(a[0]*1.1)%3!==0)m.tube(seg,seg2,.023,16,4)}
  m.tube(P(a,0,.027),P(b,0,.027),.026,16,4);m.prismBetween(P(a,0,.12),P(b,0,.12),.06,.18,18);
  for(let side of [-halfWidth+.18,halfWidth-.18])m.tube(P(a,side,.025),P(b,side,.025),.023,16,4)
 }
 }
// Map a 2D FEM node to the scenic arch segment. 2D and 3D share the same source object.
 modelToWorldNode(node,model,offset,archA=null,archB=null){
  const b=this.kerchBounds(),a=archA??b.archA,c=archB??b.archB;
  const span=Math.max(.01,model?.meta?.span||32),t=node.x/span;
  const x=a+(c-a)*t,z=this.trackCenter(x,offset);
  const deck=this.kerchDeck(x,z);
  return [x,deck+.18+(node.y-3)*.43-this.kerchDeckEdit(x),z];
 }
 addArchFromModel(m,model,x0,x1,offset,wide,rail){
  if(!model?.nodes?.length||!model?.edges?.length)return;
  const lookup=new Map(model.nodes.map(n=>[n.id,n])),sides=[-wide*.5,wide*.5];
  const matCode={steel:18,reinforced:4,concrete:4,aluminum:12,wood:2,composite:7,cable:11,stone:9};
  // Highest node at each longitudinal station defines the arched crown.
  const topAt=new Map();for(const n of model.nodes){let k=Math.round(n.x*100)/100,prev=topAt.get(k);if(!prev||n.y>prev.y)topAt.set(k,n)}
  const topNodes=[...topAt.values()].sort((a,b)=>a.x-b.x),topIds=new Set(topNodes.map(n=>n.id));
  const connected=new Map();for(const e of model.edges){let a=lookup.get(e.a),b=lookup.get(e.b);if(!a||!b||!topIds.has(a.id)||!topIds.has(b.id))continue;connected.set([Math.min(a.id,b.id),Math.max(a.id,b.id)].join(':'),e)}
  const curve=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  for(let i=0;i<topNodes.length-1;i++){
   const aa=topNodes[i],bb=topNodes[i+1],key=[Math.min(aa.id,bb.id),Math.max(aa.id,bb.id)].join(':'),e=connected.get(key);
   if(!e)continue;let p=topNodes[Math.max(0,i-1)],q=topNodes[Math.min(i+2,topNodes.length-1)];
   for(let j=1;j<=8;j++){
    let ta=(j-1)/8,tb=j/8;
    let na={x:curve(p.x,aa.x,bb.x,q.x,ta),y:curve(p.y,aa.y,bb.y,q.y,ta)};
    let nb={x:curve(p.x,aa.x,bb.x,q.x,tb),y:curve(p.y,aa.y,bb.y,q.y,tb)};
    let A=this.modelToWorldNode(na,model,offset,x0,x1),B=this.modelToWorldNode(nb,model,offset,x0,x1);
    for(const side of sides)m.prismBetween([A[0],A[1],A[2]+side],[B[0],B[1],B[2]+side],.25*(e.size||1),.34*(e.size||1),matCode[e.m]??18);
   }
  }
  for(const e of model.edges){
   let a=lookup.get(e.a),b=lookup.get(e.b);if(!a||!b)continue;
   if(topIds.has(a.id)&&topIds.has(b.id)&&connected.has([Math.min(a.id,b.id),Math.max(a.id,b.id)].join(':')))continue;
   const pa=this.modelToWorldNode(a,model,offset,x0,x1),pb=this.modelToWorldNode(b,model,offset,x0,x1);
   const mat=e.type==='cable'?5:(matCode[e.m]??18),thick=Math.max(.026,Math.min(.44,(e.size||1)*(e.type==='frame'?.15:e.type==='cable'?.028:.12)));
   for(const side of sides){
    let aa=[pa[0],pa[1],pa[2]+side],bb=[pb[0],pb[1],pb[2]+side];
    if(e.type==='cable')m.tube(aa,bb,thick,mat,6);
    else m.prismBetween(aa,bb,thick*1.7,thick*1.8,mat);
   }
  }
  // Triangulated cross-bracing, transverse portals, feet and selected-node handles.
  const upper=model.nodes.filter(n=>n.y>3.3).sort((a,b)=>a.x-b.x);
  for(let i=0;i<upper.length;i++){
   const pa=this.modelToWorldNode(upper[i],model,offset,x0,x1);
   const l=[pa[0],pa[1],pa[2]+sides[0]],r=[pa[0],pa[1],pa[2]+sides[1]];
   m.prismBetween(l,r,.075,.09,18);
   if(i>0){const prev=this.modelToWorldNode(upper[i-1],model,offset,x0,x1);
    m.tube([prev[0],prev[1],prev[2]+sides[0]],r,.040,18,5);
    m.tube([prev[0],prev[1],prev[2]+sides[1]],l,.040,18,5)}
  }
  const nodes=this.editBridge?model.nodes:[];
  for(const n of nodes){
   const pa=this.modelToWorldNode(n,model,offset,x0,x1);
   m.box(pa[0],pa[1]-.09,pa[2],.22,.18,.24,n.id===this.selectedBridgeNode?19:16);
  }
 }
 // Road and railway deck elevations react to edited 2D deck nodes.
 kerchDeckEdit(x){
  const model=this.lastState?.model,b=this.kerchBounds(),span=model?.meta?.span||32;
  if(!model?.nodes?.length||x<b.archA||x>b.archB)return 0;
  const deckNodes=model.nodes.filter(n=>n.support||model.edges?.some(e=>e.type==='frame'&&(e.a===n.id||e.b===n.id))).filter(n=>n.y<6.5).sort((a,b)=>a.x-b.x);
  if(!deckNodes.length)return 0;
  const target=(x-b.archA)/(b.archB-b.archA)*span;
  if(target<=deckNodes[0].x)return Math.max(-.5,Math.min(2,deckNodes[0].y-3))*.43;
  for(let i=1;i<deckNodes.length;i++)if(target<=deckNodes[i].x){let a=deckNodes[i-1],c=deckNodes[i],t=(target-a.x)/Math.max(.001,c.x-a.x);return Math.max(-.5,Math.min(2,(a.y-3)*(1-t)+(c.y-3)*t))*.43}
  return Math.max(-.5,Math.min(2,deckNodes[deckNodes.length-1].y-3))*.43;
 }
addKerch(m,state){
 const kb=this.kerchBounds();
 const N=this.software?126:this.quality==='ultra'?360:this.quality==='high'?280:this.quality==='medium'?210:144,
 x0=kb.x0,x1=kb.x1,roadSide=kb.roadSide,railSide=kb.railSide,archA=kb.archA,archB=kb.archB;
 let X=Array.from({length:N+1},(_,i)=>x0+(x1-x0)*i/N);
 for(let n=0;n<2;n++){
  let offset=n===0?roadSide:railSide,rail=n===1,half=rail?1.78:2.28;
  for(let i=0;i<N;i++){
   let a=this.kerchSample(X[i],offset),b=this.kerchSample(X[i+1],offset);
   this.roadRibbon(m,a,b,half,rail);
   if(i%2===0){m.tube([a[0],a[1]-.34,a[2]],[b[0],b[1]-.34,b[2]],rail?.122:.118,5,6)}
  }
  for(let x=x0+3.0;x<x1-2.0;x+=4.0){
   if(x>archA+1.3&&x<archB-1.3)continue;
   const p=this.kerchSample(x,offset),ground=this.mapHeight(x,p[2]);
   const girderY=p[1]-.47,top=Math.max(girderY,ground+.1);
   const legSpread=rail?[-.88,.88]:[-.72,.72];
   for(let dz of legSpread){
    let z=p[2]+dz;
    m.box(x,ground-.10,z,.34,Math.max(.24,top-ground+.08),.34,4);
    if(this.mapHeight(x,z)<-1.49){m.box(x,-1.90,z,.86,.46,.78,9)}
   }
   m.box(x,girderY-.10,p[2],1.22,.24,rail?3.50:4.55,4);
   if(this.quality==='ultra'||this.quality==='high'){
    // Reinforced-concrete cap with two visible bearings and protective steel frame.
    m.box(x,girderY-.24,p[2],1.65,.16,rail?3.75:4.80,9);
    for(const dz of [-1.18,1.18]){
     m.box(x,girderY-.12,p[2]+dz,.43,.11,.42,17);
     m.box(x,girderY-.02,p[2]+dz,.34,.05,.33,18);
    }
   }
  }
  for(let x=x0+1;x<x1;x+=4.0){let p=this.kerchSample(x,offset);m.prismBetween([x,p[1]-.32,p[2]-half],[x,p[1]-.32,p[2]+half],.09,.08,11)}
 }
 // Both arches are generated from the SAME editable graph used in the 2D FEM view.
 this.addArchFromModel(m,state.model,archA,archB,roadSide,4.35,false);
 this.addArchFromModel(m,state.model,archA,archB,railSide,3.18,true);
 for(let x of [archA-.3,archB+.3]){
  for(let off of [roadSide,railSide]){
   let p=this.kerchSample(x,off),ground=this.mapHeight(x,p[2]);
   m.box(x,Math.min(-1.62,ground-.75),p[2],2.7,1.38,off<0?5.5:4.2,4);
   m.box(x,ground-.10,p[2],1.46,Math.max(.2,p[1]-ground-.38),off<0?3.65:3.05,4);
   m.box(x,p[1]-.45,p[2],2.45,.30,off<0?5.6:4.1,18);
   for(let dz of [-1.20,1.20])for(let dx of [-.54,.54])m.tube([x+dx,ground-1.4,p[2]+dz],[x+dx,ground+.15,p[2]+dz],.10,9,6);
  }
 }
 for(let x=x0+4;x<x1-4;x+=5.2){
  let p=this.kerchSample(x,roadSide),z=p[2]-2.30;
  m.tube([x,p[1]+.30,z],[x,p[1]+1.82,z],.041,5,6);
  m.tube([x,p[1]+1.82,z],[x+.34,p[1]+1.86,z+.18],.032,18,6);
  m.box(x+.34,p[1]+1.82,z+.18,.2,.05,.10,23);
  if(this.quality==='ultra'){
   m.box(x,p[1]+.12,z,.30,.24,.34,4);
   m.tube([x,p[1]+1.20,z],[x+.12,p[1]+1.20,z+.14],.022,20,5);
  }
 }
 for(let x=x0+6;x<x1-6;x+=8.4){
  let p=this.kerchSample(x,railSide),z=p[2]-2.02;
  m.tube([x,p[1]+.18,z],[x,p[1]+2.30,z],.038,18,6);
  m.tube([x,p[1]+2.24,z],[x,p[1]+2.24,z+4.05],.026,18,5);
  m.box(x,p[1]+2.24,z+4.05,.12,.05,.12,25);
  if(x<x1-16){let q=this.kerchSample(x+8.4,railSide);m.tube([x,p[1]+2.24,p[2]+1.20],[x+8.4,q[1]+2.24,q[2]+1.20],.018,16,5);m.tube([x,p[1]+2.18,p[2]-1.20],[x+8.4,q[1]+2.18,q[2]-1.20],.015,16,5);}
 }
 if(this.quality==='ultra'||this.quality==='high'){
  // Periodic longitudinal expansion joints, deck drainage and visible fasteners.
  for(let x=x0+4;x<x1-2;x+=9.2){
   for(const [offset,half] of [[roadSide,2.28],[railSide,1.78]]){
    const p=this.kerchSample(x,offset);
    m.prismBetween([x,p[1]+.024,p[2]-half],[x,p[1]+.024,p[2]+half],.024,.068,17);
    for(const d of [-half+.15,half-.15])m.box(x,p[1]-.035,p[2]+d,.11,.032,.11,5);
   }
  }
 }
 // No static cars or train cars: all vehicles are spawned exclusively in the dynamic layer.
 // Settlements, fields and tree clusters are tested against the imported land mask.
 // No houses or decorative vehicles are placed in the sea.
 // No fixed decorative houses: editable TerraBuild settlements occupy this layer.
 const treeCount=this.software?180:this.quality==='ultra'?1250:this.quality==='high'?800:400;
 for(let i=0;i<treeCount;i++){
  const x=-207+(i*71.137%414),z=-207+(i*127.73%414);
  if(Math.abs(z-this.kerchCenter(x))<9)continue;
  if(this.geoPack?.coast&&sampleCoast(this.geoPack,x,z)<.92)continue;
  const y=this.mapHeight(x,z);
  if(y>.18&&y<19&&i%3!==1)this.tree(m,x,y,z,.20+(i%7)*.11);
 }
 for(let side of [-1,1]){let x=side*104;for(let z=-30;z<30;z+=2.8){let y=this.mapHeight(x,z);if(y>-.15)m.box(x,y+.02,z,1.15,.05,1.40,3)}}
 for(let bx of [archA-10,archA+6,archB-6,archB+12]){let z=this.kerchCenter(bx)+railSide,y=this.mapHeight(bx,z);m.tube([bx,Math.max(y,-1.4),z+3.2],[bx,Math.max(y,-1.4)+1.5,z+3.2],.05,18,6);m.box(bx,Math.max(y,-1.4)+1.55,z+3.2,.16,.08,.16,25);}
 // Continuous paved and railed land approaches run to the edge of the geographic window.
 this.addLandApproachCorridors(m);
 this.addBridgeAbutments(m);
 // No static cars or train cars: all vehicles are spawned exclusively in the dynamic layer.
 }
 /** Cache a grade-limited longitudinal profile per shore and per carriageway.
     TerraBuild, mesh generation, and 2D diagrams share exactly this geometry. */
 getLandApproachProfile(side,x){
  const b=this.kerchBounds(),left=x<b.x0,end=left?b.x0:b.x1,limit=left?-207:207;
  const road=side===b.roadSide,key=(road?'road':'rail')+':'+(left?'west':'east');
  if(!this.approachProfileCache)this.approachProfileCache=new Map();
  if(!this.approachProfileCache.has(key)){
   const initialHeight=this.plannedBridgeDeck(end,road);
   const sampled=x=>this.mapHeightBase(x,this.trackCenter(x,side));
   const valid=x=>{
    const z=this.trackCenter(x,side),polys=this.sampleLandMask(x,z);
    if(polys!==null)return polys>=.5;
    if(this.coastMode==='osm'&&this.geoPack?.coast)return sampleCoast(this.geoPack,x,z)>=.45;
    return sampled(x)>-1.30;
   };
   const profile=engineerProfile({startX:end,endX:limit,initialHeight,terrainAt:sampled,landAt:valid,road});
   this.approachProfileCache.set(key,profile);
  }
  return this.approachProfileCache.get(key);
 }
 landApproachElevation(x,side){
  const b=this.kerchBounds();
  if(x>=b.x0&&x<=b.x1)return this.kerchSample(x,side)[1];
  return sampleEngineeredProfile(this.getLandApproachProfile(side,x),x);
 }
 approachGradeDiagnostics(){
  const b=this.kerchBounds(),result={};
  for(const [mode,side] of [['road',b.roadSide],['rail',b.railSide]]){
   result[mode]={};
   for(const [end,x] of [['kerch',b.x0-1],['taman',b.x1+1]]){
    result[mode][end]=profileMetrics(this.getLandApproachProfile(side,x));
   }
  }
  return result;
 }
 /** Continuous verge surfaces, safety stripes and shallow drainage.
      These share the engineered longitudinal profile instead of copying DEM noise. */
 addApproachShoulders(m,p,q,half,rail){
  const dx=q[0]-p[0],dz=q[2]-p[2],L=Math.hypot(dx,dz)||1;
  const nx=-dz/L,nz=dx/L;
  const P=(v,off,h)=>[v[0]+nx*off,v[1]+h,v[2]+nz*off];
  const pad=rail?1.18:.90;
  for(const sign of [-1,1]){
   const inner=sign*(half+.025),outer=sign*(half+pad);
   // Gravel verge: slightly below the adjoining pavement, draining outward.
   m.quad(P(p,inner,-.046),P(q,inner,-.046),P(q,outer,-.18),P(p,outer,-.18),rail?13:9);
   // Crisp edge band and separated gravel shoulder detail.
   if(!rail)m.tube(P(p,inner+.10*sign,-.032),P(q,inner+.10*sign,-.032),.025,16,4);
   else m.tube(P(p,outer,-.10),P(q,outer,-.10),.024,5,4);
   // Sparse shallow drainage channels in land cuts; no imitation canal at sea.
   const mx=(p[0]+q[0])/2,mz=(p[2]+q[2])/2+sign*(half+pad+.52);
   const raw=this.mapHeightBase(mx,mz);
   if(raw>Math.max(p[1],q[1])+.18){
    const ditch=sign*(half+pad+.40);
    m.tube(P(p,ditch,-.40),P(q,ditch,-.40),.047,9,4);
   }
  }
 }

 /** v11.5: discrete bridge abutments, transition slabs and longitudinal joints.
     These are illustrative geometry, not surveyed structures. Water approaches
     use piers rather than making up an island or concrete earthworks. */
 addBridgeAbutments(m){
  if(!this.map)return 0;
  const b=this.kerchBounds();let built=0;
  for(const [side,half,rail] of [[b.roadSide,2.28,false],[b.railSide,1.78,true]]){
   for(const [edge,direction] of [[b.x0,-1],[b.x1,1]]){
    const p=this.kerchSample(edge,side),z=p[2],y=p[1];
    const ground=this.mapHeight(edge,z),foot=Math.max(-2.25,ground-.50);
    const transition=edge+direction*1.05;
    // A short composite approach slab, not an unsupported road over the shore.
    m.box(transition,y-.31,z,2.22,.29,half*2+.70,4);
    m.box(edge,y-.72,z,1.50,.31,half*2+.80,9);
    // Elastomeric bearing blocks: kept beneath the girder, not above asphalt.
    for(const dz of [-half*.52,half*.52]){
     m.box(edge,y-.46,z+dz,.48,.13,.42,17);
     if(y-.80>foot+.32){
      const columnHeight=y-.80-foot;
      m.box(edge+direction*.42,foot,z+dz,.47,columnHeight,.48,4);
     }
     if(ground<=-1.43)m.box(edge+direction*.42,-2.33,z+dz,.67,.32,.67,9);
    }
    // Transverse expansion joint + parapet ends following the deck geometry.
    m.prismBetween([edge-.13,y+.028,z-half],[edge-.13,y+.028,z+half],.032,.052,11);
    for(const sign of [-1,1]){
     m.box(transition,y-.10,z+sign*(half+.22),2.12,.22,.20,4);
     m.tube([edge-direction*.38,y+.43,z+sign*half],[transition+direction*.72,y+.43,z+sign*half],.035,18,5);
    }
    // Rail remains two-track and does not receive a road centre divider.
    if(rail)for(const zOffset of [-.69,.69])m.prismBetween([edge-.23,y+.125,z+zOffset],[transition+direction*.83,y+.125,z+zOffset],.035,.080,5);
    built++;
   }
  }
  return built;
 }
 /** Grade-constrained approaches, separated from imported DEM for edit safety. */
 addLandApproachCorridors(m){
  if(!this.map)return;
  const b=this.kerchBounds();
  for(const side of [b.roadSide,b.railSide]){
   const rail=side===b.railSide,half=rail?1.78:2.28;
   for(const [a,c] of [[-207,b.x0],[b.x1,207]]){
    const N=Math.max(1,Math.ceil(Math.abs(c-a)/1.25));
    const point=x=>[x,this.landApproachElevation(x,side),this.trackCenter(x,side)];
    for(let i=0;i<N;i++){
     const p=point(a+(c-a)*i/N),q=point(a+(c-a)*(i+1)/N);
     this.roadRibbon(m,p,q,half,rail);
     this.addApproachShoulders(m,p,q,half,rail);
    }
    // Where an approaching road is above open water, retain supports instead
    // of fabricating land; the legacy short approach ended unsupported.
    for(let x=a+2;x<c-1;x+=4.4){
     const p=point(x),floor=this.mapHeight(p[0],p[2]),beam=p[1]-.34;
     if(beam-floor<.95)continue;
     const foot=Math.max(-1.75,floor-.35);
     if(beam<=foot)continue;
     for(const dz of [-half*.55,half*.55]){
      m.box(x,(beam+foot)/2,p[2]+dz,.33,beam-foot,.33,4);
      m.box(x,foot-.10,p[2]+dz,.62,.25,.62,9);
     }
    }
   }
  }
 }

 // Editable user-built structures. Each is generated into its own cached VBO,
 // independent of terrain, bridge deck and 18 Hz traffic updates.
 settlementChanged(){this.buildingMeshDirty=true;this.buildingBufferDirty=true;this.shadowDirty=true;}
 addSettlementGeometry(m){
  if(!this.map)return;
  const box=(cx,y,cz,w,h,d,mat,rotation=0)=>{
   const t=rotation*Math.PI/180,c=Math.cos(t),si=Math.sin(t);
   const P=(xx,yy,zz)=>[cx+xx*c-zz*si,y+yy,cz+xx*si+zz*c];
   const a=P(-w/2,0,-d/2),b=P(w/2,0,-d/2),cc=P(w/2,0,d/2),dd=P(-w/2,0,d/2),A=P(-w/2,h,-d/2),B=P(w/2,h,-d/2),C=P(w/2,h,d/2),D=P(-w/2,h,d/2);
   m.quad(A,B,C,D,mat);m.quad(a,b,B,A,mat);m.quad(b,cc,C,B,mat);m.quad(cc,dd,D,C,mat);m.quad(dd,a,A,D,mat);
  };
  const roof=(cx,y,cz,w,d,rise,mat,rotation=0)=>{
   const t=rotation*Math.PI/180,c=Math.cos(t),si=Math.sin(t);
   const P=(xx,yy,zz)=>[cx+xx*c-zz*si,y+yy,cz+xx*si+zz*c];
   const a=P(-w/2-.13,0,-d/2-.13),b=P(w/2+.13,0,-d/2-.13),cc=P(w/2+.13,0,d/2+.13),dd=P(-w/2-.13,0,d/2+.13),r=P(0,rise,-d/2-.13),R=P(0,rise,d/2+.13);
   m.quad(a,r,R,dd,mat);m.quad(r,b,cc,R,mat);m.triangle(a,b,r,mat);m.triangle(dd,R,cc,mat);
  };
  for(const o of this.settlement.items){
   const typ=SETTLEMENT_TYPES[o.type],base=this.mapHeight(o.x,o.z),roofY=base+.12;
   if(o.type==='tree'){this.tree(m,o.x,base,o.z,1.25);continue;}
   if(o.type==='lamp'){m.tube([o.x,base,o.z],[o.x,base+3.15,o.z],.065,5,6);m.box(o.x,base+3.15,o.z,.45,.17,.35,23);continue;}
   const w=typ.w,d=typ.d,h=o.type==='warehouse'?2.55:o.floors*1.55+.4;
   // Plinth prevents visible floating facades on inclined terrain (not a structural foundation model).
   box(o.x,base-.18,o.z,w+.13,.31,d+.13,4,o.yaw);
   box(o.x,roofY,o.z,w,h,d,typ.mat,o.yaw);
   if(o.type==='house')roof(o.x,roofY+h,o.z,w,d,.80,typ.roof,o.yaw);
   else {box(o.x,roofY+h,o.z,w+.11,.15,d+.11,typ.roof,o.yaw);
    if(o.type==='apartment')box(o.x+.38,roofY+h+.15,o.z,.88,.20,.80,11,o.yaw);
    else box(o.x-.40,roofY+h+.16,o.z,1.1,.27,.65,14,o.yaw);
   }
   const n=o.type==='warehouse'?3:Math.max(2,Math.floor(w/.74)),levels=o.type==='warehouse'?1:o.floors;
   const t=o.yaw*Math.PI/180,c=Math.cos(t),si=Math.sin(t);
   const pos=(u,v)=>[o.x+u*c-v*si,o.z+u*si+v*c];
   for(let f=0;f<levels;f++)for(let k=0;k<n;k++){
    const xLocal=-w/2+(k+.5)*w/n,height=roofY+f*(h/levels)+.48;
    for(const face of [-1,1]){
     const [wx,wz]=pos(xLocal,face*(d/2+.035));
     box(wx,height,wz,.26,.48,.045,26,o.yaw);
    }
   }
   for(const face of [-1,1]){
    const [wx,wz]=pos(-w/2-.02,face*d*.16);
    box(wx,roofY+.65,wz,.06,.90,.36,14,o.yaw);
   }
   // Ground path: short, inexpensive, and kept away from roadway meshes.
   const pp=pos(0,-d/2-.38);m.box(pp[0],base+.035,pp[1],.52,.05,.65,3);
  }
 }

 /** Import real open-map footprint shapes, not the procedural TerraBuild demos. */
 loadCityGeoJSON(source,{append=false}={}){
  const combined=append&&this.cityData?{type:"FeatureCollection",name:"GeoCity combined",features:[...this.cityData.sourceGeoJSON.features,...source.features]}:source;
  const result=parseCityGeoJSON(combined);
  this.clearCityTiles();this.cityData=result;this.cityEnabled=true;
  return result.report;
 }
 clearCityTiles(){
  if(this.gl)for(const tile of this.cityCache.values())if(tile.buffer)this.gl.deleteBuffer(tile.buffer);
  this.cityCache.clear();this.cityVisible=[];this.cityTilesBuilt=0;this.cityTilesUploaded=0;
 }
 clearCityData(){this.clearCityTiles();this.cityData=null;}
 cityTileGeometry(features){
  const m=new Mesh();
  for(const o of features){
   if(o.kind==='building'){
    const h=o.heightM/this.demMetresPerUnit;
    const centerX=(o.bb[0]+o.bb[2])/2,centerZ=(o.bb[1]+o.bb[3])/2;
    const base=Math.max(...o.points.map(([x,z])=>this.mapHeight(x,z)),this.mapHeight(centerX,centerZ))+.045;
    if(base<-1.35)continue;
    for(const tri of o.triangles)m.triangle(...[tri[0],tri[2],tri[1]].map(([x,z])=>[x,base+h,z]),20);
    for(let i=0;i<o.points.length;i++){
     const [x,z]=o.points[i], [nx,nz]=o.points[(i+1)%o.points.length];
     const a=[x,this.mapHeight(x,z)-.025,z],b=[nx,this.mapHeight(nx,nz)-.025,nz];
     if(Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2])<.0001)continue;
     m.quad([x,base+h,z],[nx,base+h,nz],b,a,21);
    }
   }else{
    const [a,b]=o.points,cx=(a[0]+b[0])*.5,cz=(a[1]+b[1])*.5;
    if(this.geoPack?.coast && sampleCoast(this.geoPack,cx,cz)<.35)continue;
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<.0005)continue;
    const w=Math.max(.055,o.widthM/(this.demMetresPerUnit*10))*.5;
    const px=-(b[1]-a[1])/d*w,pz=(b[0]-a[0])/d*w;
    const up=(x,z)=>[x,this.mapHeight(x,z)+.074,z];
    m.quad(up(a[0]-px,a[1]-pz),up(a[0]+px,a[1]+pz),up(b[0]+px,b[1]+pz),up(b[0]-px,b[1]-pz),o.kind==='rail'?11:3);
   }
  }
  return m;
 }
 /** Camera-local GPU cache: bounded and updated independently of traffic. */
 streamCity(maxBuild=4){
  if(!this.map||!this.cityData||!this.cityEnabled||this.software||!this.gl){this.cityVisible=[];return false}
  const cx=Math.floor(this.camPos[0]/CITY_SPAN),cz=Math.floor(this.camPos[2]/CITY_SPAN),radius=this.camPos[1]>110?6:this.camPos[1]>45?5:4;
  const candidates=[];
  for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
   const key=`${x}:${z}`,items=this.cityData.tiles.get(key);
   if(items?.length)candidates.push({key,items,distance:Math.max(Math.abs(x-cx),Math.abs(z-cz))});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  let built=0;
  for(const c of candidates){
   if(this.cityCache.has(c.key)||built>=maxBuild)continue;
   const mesh=this.cityTileGeometry(c.items),gl=this.gl,buf=gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.a),gl.STATIC_DRAW);
   this.cityCache.set(c.key,{buffer:buf,count:mesh.a.length/7,key:c.key});this.cityTilesBuilt++;this.cityTilesUploaded++;built++;this.shadowDirty=true;
  }
  const visible=[];for(const c of candidates){const t=this.cityCache.get(c.key);if(t&&t.count)visible.push(t)}
  this.cityVisible=visible;
  if(this.cityCache.size>110){const desired=new Set(candidates.map(c=>c.key));for(const [key,t] of this.cityCache){if(this.cityCache.size<=85)break;if(!desired.has(key)){this.gl.deleteBuffer(t.buffer);this.cityCache.delete(key)}}}
  return built>0;
 }
 roadPose(x,side,lane=0){
  const p=this.kerchSample(x,side),q=this.kerchSample(wClamp(x+.9,this.kerchBounds().x0,this.kerchBounds().x1),side),dir=norm(sub(q,p)),right=norm(cross([0,1,0],dir));
  return {pos:add(p,scale(right,lane)),dir,right};
 }
 addRoadVehicle(m,x,lane,speedDir=1,mat=19){
  const pose=this.roadPose(x,this.kerchBounds().roadSide,lane),len=1.10+.12*Math.abs(lane),front=add(pose.pos,scale(pose.dir,len*.5*speedDir)),back=add(pose.pos,scale(pose.dir,-len*.5*speedDir));
  m.prismBetween(back,front,.17,.44,mat);
  m.prismBetween(add(back,[0,.16,0]),add(front,[0,.16,0]),.12,.31,14);
  if(this.quality==='ultra'||this.quality==='high'){
   const nose=add(front,[0,.15,0]),tail=add(back,[0,.15,0]);
   m.prismBetween(add(nose,scale(pose.right,-.12)),add(nose,scale(pose.right,.12)),.045,.020,21);
   for(const sign of [-1,1]){
    const f=add(nose,scale(pose.right,sign*.13));
    m.box(f[0],f[1],f[2],.075,.075,.075,sign>0?23:25);
   }
  }
  for(const axle of [-.28,.28])for(const side of [-.16,.16]){
   const hub=add(pose.pos,add(scale(pose.dir,axle*speedDir),scale(pose.right,side)));
   m.tube(add(hub,[0,.02,0]),add(hub,[0,.12,0]),.05,17,5);
  }
 }
 addTrainCar(m,x,trackOffset=0,dir=1,index=0){
  const side=this.kerchBounds().railSide,pose=this.roadPose(x,side,trackOffset),len=4.45,front=add(pose.pos,scale(pose.dir,len*.5*dir)),back=add(pose.pos,scale(pose.dir,-len*.5*dir));
  const body=index===0?18:12,roof=index===0?20:18;
  m.prismBetween(add(back,[0,.16,0]),add(front,[0,.16,0]),.55,.92,body);
  m.prismBetween(add(back,[0,.72,0]),add(front,[0,.72,0]),.17,.78,roof);
  if(this.quality==='ultra'||this.quality==='high'){
   // Windows, undercarriage, pantograph-like roof detail on the lead car.
   for(const zside of [-1,1])for(let j=0;j<7;j++){
    const v=add(pose.pos,add(scale(pose.dir,-1.8+j*.57),scale(pose.right,zside*.48)));
    m.box(v[0],v[1]+.38,v[2],.24,.21,.048,14);
   }
   if(index===0){
    const roofCentre=add(pose.pos,[0,.90,0]);
    m.tube(roofCentre,add(roofCentre,scale(pose.dir,.55)),.026,18,5);
    m.tube(add(roofCentre,scale(pose.dir,.55)),add(roofCentre,[0,.42,0]),.021,18,5);
   }
  }
  for(const sideOff of [-.25,.25])for(const dx of [-1.55,1.55]){
   const wheel=add(pose.pos,add(scale(pose.dir,dx*dir),scale(pose.right,sideOff)));
   m.tube(add(wheel,[0,.02,0]),add(wheel,[0,.20,0]),.06,17,5);
  }
 }
 addShip(m,x,z,heading=1,scaleShip=1){
  const p=[x,-1.46,z];
  const forward=norm([.12*heading,0,1]),front=add(p,scale(forward,2.9*scaleShip)),back=add(p,scale(forward,-2.9*scaleShip)),side=norm(cross([0,1,0],forward));
  m.prismBetween(add(back,[0,.04,0]),add(front,[0,.04,0]),.42*scaleShip,1.02*scaleShip,9);
  m.prismBetween(add(back,[0,.44,0]),add(front,[0,.44,0]),.18*scaleShip,.75*scaleShip,20);
  m.box(p[0]-.22*heading,p[1]+.62,p[2]-.10,1.15*scaleShip,.46*scaleShip,.62*scaleShip,18);
  m.box(front[0],p[1]+.82,front[2],.13*scaleShip,.08,.13*scaleShip,23);
  m.box(back[0],p[1]+.62,back[2],.12*scaleShip,.07,.12*scaleShip,25);
  for(let i=0;i<6;i++){let t=i/5,pt=add(back,scale(forward,-(1.2+i*1.05)*scaleShip)),w=(.28+.18*t)*scaleShip;m.prismBetween(add(pt,scale(side,-w)),add(pt,scale(side,w)),.02,.055,24);}
 }
 addTrafficKerch(m){
  const t=this.animationTime||0,b=this.kerchBounds(),roadLanes=[-1.42,-.48,.48,1.42];
  for(let i=0;i<16;i++){
   const dir=i%2===0?1:-1,span=b.x1-b.x0-14,base=dir>0?b.x0+7:b.x1-7;
   const dist=((t*(dir>0?10.5:8.8)+i*14.7)%span),x=dir>0?base+dist:base-dist;
   this.addRoadVehicle(m,x,roadLanes[i%roadLanes.length],dir,[18,19,20,22,7,5][i%6]);
  }
  const headA=lerp(b.x0+16,b.x1-12,((t*.028)%1));
  for(let i=0;i<7;i++)this.addTrainCar(m,headA-i*5.1,-.69,1,i);
  const headB=lerp(b.x1-18,b.x0+18,((t*.021+0.38)%1));
  for(let i=0;i<6;i++)this.addTrainCar(m,headB+i*5.0,.69,-1,i);
  const shipZ=-38+((t*7.5)%90),shipX=58+2.8*Math.sin((shipZ+12)*.06);
  this.addShip(m,shipX,shipZ,1,1.08);
  const shipZ2=48-((t*5.2)%86),shipX2=54+2.2*Math.sin((shipZ2-8)*.07);
  this.addShip(m,shipX2,shipZ2,-1,.82);
 }
addBridge(m,s){let mod=s.model,L=s.span,shift=-L/2,yd=3.0,geom=mod?.nodes||[],byId=new Map(geom.map(n=>[n.id,n]));m.box(0,-2.15,0,this.worldSize,.07,this.worldSize,6);
 // land banks
 for(let x of [-L/2-2,L/2+2])m.box(x,-2.5,0,5,2.7,18,0);
 for(let side of [-2.8,2.8]){
 for(let e of mod.edges){let a=byId.get(e.a),b=byId.get(e.b);if(!a||!b)continue;let mat=s.id==='golden'?19:s.id==='millau'?20:e.type==='cable'?5:({wood:2,concrete:4,reinforced:4,aluminum:12,composite:7,stone:9,steel:5,cable:5}[e.m]||5);m.tube([a.x+shift,a.y,side],[b.x+shift,b.y,side],e.type==='frame'?.18:e.type==='cable'?.07:.105,mat,e.type==='cable'?6:8)}
 for(let n of geom)if(n.support){let x=n.x+shift;m.box(x,-2.2,side,.8,n.y+2.2,.8,4)}
 }
 // deck and railings
 m.box(0,yd-.22,0,L,.42,6.2,3);
 for(let x=-L/2;x<L/2-.01;x+=1.4){m.box(x+.3,yd+.015,0,.68,.019,.055,16)}
 for(let side of [-3.1,3.1]){m.tube([-L/2,yd+.45,side],[L/2,yd+.45,side],.05,5,5);for(let x=-L/2;x<=L/2;x+=3)m.tube([x,yd+.02,side],[x,yd+.45,side],.04,5,5)}
 if(s.id==='golden'){for(let x of [-L*.25,L*.25]){for(let z of [-2.85,2.85]){m.box(x,yd,z,.76,13,.82,19);m.box(x,yd+11.4,z,1.05,1,.95,19)}for(let y of [yd+7,yd+11.6])m.box(x,y,0,1,.65,6.9,19)}}
 if(s.id==='millau'){for(let x of [-L*.33,-L*.11,L*.11,L*.33]){m.tube([x,yd-.1,0],[x,yd+11,0],.24,20,7);for(let t of [-7,-3,3,7]){if(x+t>-L/2&&x+t<L/2){m.tube([x,yd+10.5,0],[x+t,yd+.1,-2.7],.045,12,5);m.tube([x,yd+10.5,0],[x+t,yd+.1,2.7],.045,12,5)}}}}
 if(s.id==='paton'){for(let z of [-2.4,2.4])m.box(0,yd-1,z,L,.65,.48,5);}
 if(s.kind==='suspension'&&s.id==='brooklyn'){for(let x of [-L*.26,L*.26]){m.box(x,yd+.05,0,2.2,8,6.7,9);m.box(x,yd+8.0,0,3,.5,6.9,4)}}
 }
 updateCoastTexture(){
  if(this.software||!this.gl||!this.coastTex||!this.map||!this.coastDirty)return;
  let gl=this.gl,n=this.quality==='ultra'?512:this.quality==='high'?384:256,pixels=new Uint8Array(n*n*4),S=this.worldSize;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   let x=S*((i+.5)/n-.5),z=S*((j+.5)/n-.5),h=this.mapHeight(x,z),delta=h+1.49,shallow=Math.max(0,Math.min(1,(delta+1.7)/2.2)),foam=Math.exp(-Math.abs(delta)*5.2);
   let k=(j*n+i)*4;pixels[k]=Math.round(255*shallow);pixels[k+1]=Math.round(255*foam);pixels[k+2]=0;pixels[k+3]=255;
  }
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.coastTex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  this.coastDirty=false;
 }
 /** Allocate RGBA-packed depth and a depth attachment for a static shadow atlas. */
 ensureShadowFramebuffer(){
  if(!this.gl||!this.shadowProg||!this.shadowsEnabled)return false;
  const gl=this.gl,size=this.quality==='ultra'?2048:this.quality==='high'?1024:512;
  if(this.shadowMap&&this.shadowSize===size)return true;
  if(this.shadowMap){gl.deleteTexture(this.shadowMap);gl.deleteFramebuffer(this.shadowFbo);gl.deleteRenderbuffer(this.shadowDepth);this.shadowMap=null;this.shadowFbo=null;this.shadowDepth=null;this.shadowSize=0;}
  const tex=gl.createTexture(),fb=gl.createFramebuffer(),depth=gl.createRenderbuffer();
  gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,size,size);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
  if(!complete){gl.deleteTexture(tex);gl.deleteFramebuffer(fb);gl.deleteRenderbuffer(depth);this.shadowsEnabled=false;return false;}
  this.shadowMap=tex;this.shadowFbo=fb;this.shadowDepth=depth;this.shadowSize=size;this.shadowDirty=true;return true;
 }
 /** Refresh cached static shadows only on changes, not at traffic animation rate. */
 renderStaticShadows(rig){
  if(this.software||this.daylight==='night'||this.quality==='low'||!this.ensureShadowFramebuffer())return false;
  const now=performance.now();
  if(this.shadowDirty&&(this.lastShadowDraw<0||now-this.lastShadowDraw>430)){
   const gl=this.gl;
   const look=[0,3,0],eye=add(look,scale(rig.sun,520));
   this.shadowMatrix=matmul(orthographic(-310,310,-310,310,10,940),lookAt(eye,look));
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFbo);gl.viewport(0,0,this.shadowSize,this.shadowSize);
   gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(this.shadowProg);gl.uniformMatrix4fv(this.shadowVP,false,new Float32Array(this.shadowMatrix));
   gl.enableVertexAttribArray(this.shadowP);
   gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.vertexAttribPointer(this.shadowP,3,gl.FLOAT,false,28,0);
   gl.drawArrays(gl.TRIANGLES,0,this.count);
   if(this.buildingCount){gl.bindBuffer(gl.ARRAY_BUFFER,this.buildingBuffer);if(this.buildingBufferDirty){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.buildingMesh.a),gl.STATIC_DRAW);this.buildingBufferDirty=false;}gl.vertexAttribPointer(this.shadowP,3,gl.FLOAT,false,28,0);gl.drawArrays(gl.TRIANGLES,0,this.buildingCount);}
   for(const tile of this.visibleChunks){gl.bindBuffer(gl.ARRAY_BUFFER,tile.buffer);gl.vertexAttribPointer(this.shadowP,3,gl.FLOAT,false,28,0);gl.drawArrays(gl.TRIANGLES,0,tile.count)}
   for(const tile of this.cityVisible){gl.bindBuffer(gl.ARRAY_BUFFER,tile.buffer);gl.vertexAttribPointer(this.shadowP,3,gl.FLOAT,false,28,0);gl.drawArrays(gl.TRIANGLES,0,tile.count)}
   gl.disableVertexAttribArray(this.shadowP);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   this.shadowDirty=false;this.lastShadowDraw=now;
  }
  return !!this.shadowMatrix;
 }
 render(state,rebuild=true){if(!this.ready)return;if(state)this.lastState=state;state=this.lastState;if(!state)return;
 let gl=this.gl,w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
 let dpi=this.quality==='ultra'?2.25:this.quality==='high'?1.7:this.quality==='medium'?1.4:1;
 let ratio=Math.min((devicePixelRatio||1)*this.resolutionScale,this.software?1.25:dpi),W=Math.round(w*ratio),H=Math.round(h*ratio);
 if(this.canvas.width!==W||this.canvas.height!==H){this.canvas.width=W;this.canvas.height=H}
 if(rebuild||this.sceneDirty){let buildStart=performance.now(),m=this.mesh;m.clear();this.makeLand(m,state);if(this.map)this.addKerch(m,state);else if(state.track==='foundation')this.addHouse(m,state);else this.addBridge(m,state);this.count=m.a.length/7;this.sceneDirty=false;this.bufferDirty=true;this.shadowDirty=true;this.staticBuilds++;this.stats.meshMs=performance.now()-buildStart;this.coastDirty=true;this.trafficDirty=true;}
 if(this.map)this.streamCity();
 if(this.buildingMeshDirty){this.buildingMesh.clear();this.addSettlementGeometry(this.buildingMesh);this.buildingCount=this.buildingMesh.a.length/7;this.buildingMeshDirty=false;this.buildingBufferDirty=true;}
 if(this.trafficDirty){this.trafficMesh.clear();if(this.map&&this.trafficEnabled)this.addTrafficKerch(this.trafficMesh);this.trafficCount=this.trafficMesh.a.length/7;this.trafficDirty=false;this.trafficBufferDirty=true;this.trafficUpdates++;}
 this.stats.triangles=Math.round((this.count+this.trafficCount+this.buildingCount+this.visibleChunks.reduce((n,c)=>n+c.count,0)+this.cityVisible.reduce((n,c)=>n+c.count,0))/3);
 const {forward}=this.cameraBasis(),eye=this.camPos.slice(),target=add(eye,forward);
 let vp=matmul(perspective(Math.PI/3,w/h,.13,900),lookAt(eye,target));this.vp=vp;this.eye=eye;this.focal=target;
 if(this.software){this.renderSoftware(w,h,ratio);this.recordFrame();return}
 gl.viewport(0,0,W,H);let clear=this.daylight==='night'?[.055,.08,.15,1]:this.daylight==='sunset'?[.79,.66,.55,1]:[.59,.77,.87,1];gl.clearColor(...clear);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 if(this.skyProg){gl.disable(gl.DEPTH_TEST);gl.useProgram(this.skyProg);gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.skyPosLoc);gl.vertexAttribPointer(this.skyPosLoc,2,gl.FLOAT,false,8,0);gl.uniform1f(this.skyTime,performance.now()*.001);gl.uniform1f(this.skyWeather,this.daylight==='sunset'?1:this.daylight==='night'?2:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(this.skyPosLoc);gl.enable(gl.DEPTH_TEST);}
 gl.useProgram(this.prog);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
 if(this.bufferDirty){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.mesh.a),gl.STATIC_DRAW);this.bufferDirty=false;this.shadowDirty=true;}this.updateCoastTexture();
 const rig=this.lightingRig();const shadowsActive=this.renderStaticShadows(rig);
 gl.viewport(0,0,W,H);gl.useProgram(this.prog);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
 gl.uniformMatrix4fv(this.uLightVP,false,new Float32Array(this.shadowMatrix||matmul(orthographic(-310,310,-310,310,10,940),lookAt([0,400,0],[0,0,0]))));
 gl.uniform1f(this.uShadowOn,shadowsActive?1:0);
 gl.uniform2f(this.uShadowTexel,1/Math.max(1,this.shadowSize),1/Math.max(1,this.shadowSize));
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadowMap||this.coastTex);gl.uniform1i(this.uShadowMap,1);
 let stride=28;for(let [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset)}
 gl.uniformMatrix4fv(this.uvp,false,new Float32Array(vp));gl.uniform1f(this.ut,performance.now()*.001);gl.uniform1f(this.ud,0);gl.uniform1f(this.uf,this.map?220:105);gl.uniform3fv(this.uc,new Float32Array(this.camPos));gl.uniform1f(this.uWorldSize,this.worldSize);gl.uniform1f(this.uCoastEnabled,this.map?1:0);gl.uniform1f(this.uMaterialSaturation,this.materialSaturation);gl.uniform1f(this.uFogDensity,this.fogDensity);gl.uniform1f(this.uGGX,this.ggxEnabled?1:0);gl.uniform1f(this.uRoughness,this.materialRoughness);gl.uniform1f(this.uExposure,(this.daylight==='night'?.95:this.daylight==='sunset'?1.08:1.15)*this.exposure);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.coastTex);gl.uniform1i(this.uCoast,0);
 gl.uniform3fv(this.uSunDir,new Float32Array(rig.sun));gl.uniform3fv(this.uSunColor,new Float32Array(rig.color));
 const lights=this.nearestLampPositions(),lightsFloat=new Float32Array(36);
 for(let i=0;i<lights.length;i++)lightsFloat.set(lights[i],i*3);
 gl.uniform3fv(this.uLampPositions,lightsFloat);gl.uniform1f(this.uLampCount,lights.length);
 if(this.uw)gl.uniform1f(this.uw,this.daylight==='sunset'?1:this.daylight==='night'?2:0);
 gl.drawArrays(gl.TRIANGLES,0,this.count);
 // TerraBuild objects: one cached draw call; no terrain or road reconstruction on placement.
 if(this.buildingCount){gl.bindBuffer(gl.ARRAY_BUFFER,this.buildingBuffer);
  if(this.buildingBufferDirty){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.buildingMesh.a),gl.STATIC_DRAW);this.buildingBufferDirty=false;}
  for(const [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]])gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);
  gl.drawArrays(gl.TRIANGLES,0,this.buildingCount);
 }
 // Draw independently cached coastal tiles; old static mesh is never re-uploaded.
 gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1.2,-1.5);
 for(const tile of this.visibleChunks){
  gl.bindBuffer(gl.ARRAY_BUFFER,tile.buffer);
  for(const [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]])gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);
  gl.drawArrays(gl.TRIANGLES,0,tile.count);
 }
 gl.disable(gl.POLYGON_OFFSET_FILL);
 // GIS buildings and streets: cached geographic tile buffers, never updated by traffic.
 for(const tile of this.cityVisible){
  gl.bindBuffer(gl.ARRAY_BUFFER,tile.buffer);
  for(const [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]])gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);
  gl.drawArrays(gl.TRIANGLES,0,tile.count);
 }
 // Only the small dynamic vehicle mesh is re-uploaded; terrain, bridge and shoreline stay cached.
 if(this.trafficCount>0){gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamicBuffer);
  if(this.trafficBufferDirty){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.trafficMesh.a),gl.DYNAMIC_DRAW);this.trafficBufferDirty=false;}
  for(let [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]])gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);
  gl.drawArrays(gl.TRIANGLES,0,this.trafficCount);
 }
 this.recordFrame();
 this.message=this.map?'Секторы побережья · WGS84≈ · трафик отдельно · FreeCam':state.track==='foundation'?'3D оснований и рельефа':'3D сцена моста · сценарий синхронизирован с 2D';
 }
 recordFrame(){let s=this.stats,now=performance.now();s.frames++;if(!s.lastMeasure)s.lastMeasure=now;if(now-s.lastMeasure>=900){s.fps=Math.round(1000*s.frames/(now-s.lastMeasure));s.frames=0;s.lastMeasure=now;}}
 setTrafficEnabled(enabled){this.trafficEnabled=!!enabled;this.trafficDirty=true;this.animBucket=-1;this.render(this.lastState,false)}
 tick(t){if(!this.lastState)return;let dt=this.lastFrame?Math.min(45,t-this.lastFrame):16;this.lastFrame=t;this.animationTime=t*.001;
 let was=this.camPos.slice();
 if(this.cameraMode==='cinematic'&&this.map){const tt=this.animationTime*.12,b=this.kerchBounds();this.camPos=[lerp(64,-74,(Math.sin(tt*.8)+1)/2),11.5+1.8*Math.sin(tt*2.2),lerp(-46,36,(Math.sin(tt)+1)/2)];const focal=[18,6,-4];let dir=norm(sub(focal,this.camPos));this.yaw=Math.atan2(dir[0],dir[2]);this.pitch=Math.asin(dir[1]);}else this.step(dt);
 let moved=Math.hypot(...sub(was,this.camPos))>.001;
 if(this.map&&this.trafficEnabled){const hz=this.software?.5:18;let bucket=Math.floor(this.animationTime*hz);if(bucket!==this.animBucket){this.animBucket=bucket;this.trafficDirty=true;}}
 // The CPU fallback does not attempt high-frequency animation or heavy software sorting.
 if(this.software){if((moved||this.sceneDirty||this.trafficDirty)&&t-(this.lastDraw||0)>700){this.render(this.lastState,this.sceneDirty);this.lastDraw=t}return;}
 // Paused traffic still permits FreeCam, sun/water shader and 2D synchronisation.
 const streamed=this.streamTerrain(4);
 if(moved||streamed||this.sceneDirty||this.trafficDirty||this.daylight!=='night'&&t-this.lastDraw>(this.quality==='ultra'?28:this.quality==='high'?40:this.quality==='medium'?85:160)){this.render(this.lastState,this.sceneDirty);this.lastDraw=t}
 }
 brushAt(pos,mode,r){let w=this.worldSize,x=pos[0],z=pos[2];let cx=(x/w+.5)*64,cz=(z/w+.5)*64,rx=r/w*64;let newVals=[];for(let j=Math.max(1,Math.floor(cz-rx-1));j<=Math.min(63,Math.ceil(cz+rx+1));j++)for(let i=Math.max(1,Math.floor(cx-rx-1));i<=Math.min(63,Math.ceil(cx+rx+1));i++){let d=Math.hypot(i-cx,j-cz);if(d>rx)continue;let idx=j*65+i,wt=(1-d/Math.max(rx,.01))*.24;let t=this.map?this.mapEdit:this.terrain;if(mode==='raise')t[idx]=clampTerrain(t[idx]+wt);if(mode==='lower')t[idx]=clampTerrain(t[idx]-wt);if(mode==='smooth'){let near=(t[idx-1]+t[idx+1]+t[idx-65]+t[idx+65])/4;newVals.push([idx,t[idx]*(1-wt)+near*wt])}if(mode==='paint-grass')this.paintLayer[idx]=0;if(mode==='paint-sand')this.paintLayer[idx]=1;if(mode==='paint-rock')this.paintLayer[idx]=3;if(mode==='paint-asphalt')this.paintLayer[idx]=4}newVals.forEach(([idx,v])=>(this.map?this.mapEdit:this.terrain)[idx]=v);this.sceneDirty=true;this.coastDirty=true;if(this.map){this.approachProfileCache.clear();this.clearTerrainChunks()}}
 rayGround(px,py){let w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return null;let eye=this.eye,{forward,right,up}=this.cameraBasis(),a=(px/w*2-1)*Math.tan(Math.PI/6)*w/h,b=(1-py/h*2)*Math.tan(Math.PI/6),d=norm(add(add(scale(right,a),scale(up,b)),forward));if(Math.abs(d[1])<1e-5)return null;let t=(0-eye[1])/d[1];if(t<0)return null;let p=add(eye,scale(d,t));if(Math.abs(p[0])>this.worldSize*.5||Math.abs(p[2])>this.worldSize*.5)return null;return p}
 rayTerrain(px,py){
  const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return null;
  const {forward,right,up}=this.cameraBasis(),eye=this.camPos;
  const a=(px/w*2-1)*Math.tan(Math.PI/6)*w/h,b=(1-py/h*2)*Math.tan(Math.PI/6);
  const d=norm(add(add(scale(right,a),scale(up,b)),forward));
  let t0=.3,f0=eye[1]+d[1]*t0-this.mapHeight(eye[0]+d[0]*t0,eye[2]+d[2]*t0);
  for(let t=t0+1.0;t<650;t+=1.5){
   const x=eye[0]+d[0]*t,z=eye[2]+d[2]*t;
   if(Math.abs(x)>this.worldSize/2||Math.abs(z)>this.worldSize/2)return null;
   const f=eye[1]+d[1]*t-this.mapHeight(x,z);
   if(f<=0&&f0>0){let lo=t-1.5,hi=t;for(let j=0;j<9;j++){const mid=(lo+hi)/2,mx=eye[0]+d[0]*mid,mz=eye[2]+d[2]*mid;if(eye[1]+d[1]*mid>this.mapHeight(mx,mz))lo=mid;else hi=mid;}
    const tt=(lo+hi)/2;return [eye[0]+d[0]*tt,this.mapHeight(eye[0]+d[0]*tt,eye[2]+d[2]*tt),eye[2]+d[2]*tt];
   }
   f0=f;
  }
  return null;
 }
 projectWorld(p){
  const M=this.vp,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
  if(!M||!w||!h)return null;
  const px=M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12],py=M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13],pw=M[3]*p[0]+M[7]*p[1]+M[11]*p[2]+M[15];
  if(pw<.12)return null;return {x:(px/pw*.5+.5)*w,y:(.5-py/pw*.5)*h};
 }
 hitBridgeNode(px,py){
  let model=this.lastState?.model;if(!this.map||!this.editBridge||!model)return null;
  let found=null,dist=18;
  for(let n of model.nodes){let w=this.modelToWorldNode(n,model,this.kerchBounds().roadSide),p=this.projectWorld(w);if(!p)continue;let d=Math.hypot(px-p.x,py-p.y);if(d<dist){dist=d;found=n}}
  return found;
 }
 bindEvents(){let c=this.canvas;
c.tabIndex=0;
c.addEventListener('pointerdown',e=>{if(e.button===2)return;c.focus();const rect=c.getBoundingClientRect();
 const settlementClick=this.placeMode&&this.map&&!e.shiftKey;const hit=settlementClick?null:this.hitBridgeNode(e.clientX-rect.left,e.clientY-rect.top);
 this.drag={x:e.clientX,y:e.clientY,mode:hit?'bridge-node':settlementClick?'settlement':this.brush,nodeId:hit?.id||null,originX:hit?.x||0,originY:hit?.y||0,startX:e.clientX,startY:e.clientY,saved:false};
 if(hit){this.selectedBridgeNode=hit.id;this.onBridgeSelect?.(hit.id);this.sceneDirty=true;this.render(this.lastState,true)}
 try{c.setPointerCapture(e.pointerId)}catch(err){}
 if(!hit&&!settlementClick&&this.brush!=='orbit'){this.onEditStart?.();let p=this.rayGround(e.clientX-rect.left,e.clientY-rect.top);if(p){this.brushAt(p,this.brush,this.radius);this.render(this.lastState)}}});
c.addEventListener('pointermove',e=>{if(!this.drag)return;let dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
 if(this.drag.mode==='bridge-node'){
  const drag=this.drag,n=this.lastState?.model?.nodes.find(n=>n.id===drag.nodeId);
  if(n&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>3){
   if(!drag.saved){this.onEditStart?.();drag.saved=true}
   const span=this.lastState.model.meta.span;
   if(e.shiftKey)n.x=wClamp(Math.round((drag.originX+(e.clientX-drag.startX)*.06)*2)/2,0,span);
   n.y=wClamp(Math.round((drag.originY-(e.clientY-drag.startY)*.052)*2)/2,-1,24);
   this.sceneDirty=true;
  }
 }else if(this.drag.mode==='settlement'){/* click or Shift+drag to orbit */}
 else if(this.drag.mode==='orbit'){this.yaw-=dx*.0068;this.pitch=wClamp(this.pitch-dy*.0048,-1.32,1.2)}
 else{let rect=c.getBoundingClientRect(),p=this.rayGround(e.clientX-rect.left,e.clientY-rect.top);if(p)this.brushAt(p,this.brush,this.radius)}
 this.drag.x=e.clientX;this.drag.y=e.clientY;
 this.render(this.lastState,this.drag.mode!=='orbit')});
c.addEventListener('pointerup',e=>{if(this.drag?.mode==='settlement'&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<6){const rect=c.getBoundingClientRect();const hit=this.rayTerrain(e.clientX-rect.left,e.clientY-rect.top);if(hit)this.onSettlementClick?.(hit[0],hit[2]);}if(this.drag?.mode!=='orbit'&&this.drag?.mode!=='settlement'&&(this.drag?.mode!=='bridge-node'||this.drag?.saved))this.onEditEnd?.();this.drag=null});
c.addEventListener('pointercancel',()=>{if(this.drag?.mode!=='orbit'&&this.drag?.mode!=='settlement'&&(this.drag?.mode!=='bridge-node'||this.drag?.saved))this.onEditEnd?.();this.drag=null});
c.addEventListener('wheel',e=>{e.preventDefault();let {forward}=this.cameraBasis(),step=(e.deltaY<0?1:-1)*this.moveSpeed*1.5;this.camPos=add(this.camPos,scale(forward,step));this.render(this.lastState,false)},{passive:false});
c.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLElement&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(this.canvas.style.display==='none')return;this.keys[e.code]=true;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code))e.preventDefault()});
window.addEventListener('keyup',e=>{delete this.keys[e.code]});window.addEventListener('blur',()=>this.keys={});
}
}
