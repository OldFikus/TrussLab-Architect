export const MAT={
 steel:{name:'Конструкционная сталь',E:205e6,A:.024,I:.00144,ft:255e3,fc:255e3,price:76,density:7850,color:'#40788c'},
 concrete:{name:'Бетон',E:31e6,A:.16,I:.0022,ft:1800,fc:18000,price:70,density:2400,color:'#a8ada9'},
 reinforced:{name:'Железобетон',E:34e6,A:.14,I:.016,ft:18000,fc:25000,price:112,density:2500,color:'#879a90'},
 wood:{name:'Клеёная древесина',E:12e6,A:.046,I:.00026,ft:17000,fc:15000,price:37,density:500,color:'#a67b50'},
 aluminum:{name:'Алюминиевый сплав',E:70e6,A:.032,I:.00024,ft:145e3,fc:145e3,price:150,density:2700,color:'#8daebb'},
 composite:{name:'Композит FRP',E:52e6,A:.035,I:.00027,ft:165e3,fc:95000,price:180,density:1800,color:'#649897'},
 cable:{name:'Высокопрочный трос',E:170e6,A:.013,I:.000001,ft:950e3,fc:0,price:116,density:7850,color:'#d3974e'},
 stone:{name:'Каменная кладка',E:14e6,A:.19,I:.020,ft:900,fc:14000,price:92,density:2300,color:'#bcb5a5'}
};
export const SOILS={
 sand:{name:'Песок',phi:32,c:0,gamma:18,Es:27000,nu:.3,water:false,color:'#d3b681',description:'Дренирует воду; рыхлый и плотный песок существенно различаются.'},
 gravel:{name:'Гравий',phi:38,c:0,gamma:20,Es:65000,nu:.24,water:false,color:'#b3a995',description:'Обычно имеет высокую жёсткость при хорошем уплотнении.'},
 loam:{name:'Суглинок',phi:24,c:12,gamma:18,Es:16000,nu:.33,water:false,color:'#a88c6e',description:'Свойства сильно зависят от влажности и плотности.'},
 clay:{name:'Глина',phi:18,c:22,gamma:17,Es:9000,nu:.39,water:false,color:'#9b7964',description:'Осадка может развиваться со временем; консолидация здесь не моделируется.'},
 peat:{name:'Болото / торф',phi:8,c:8,gamma:11,Es:1600,nu:.44,water:true,color:'#604e42',description:'Очень слабый сжимаемый грунт; обычное мелкое основание часто не подходит.'},
 silt:{name:'Пылеватый грунт',phi:22,c:6,gamma:16,Es:8000,nu:.36,water:true,color:'#b7a38d',description:'Чувствителен к увлажнению, размыву и динамическим воздействиям.'},
 fill:{name:'Насыпной грунт',phi:23,c:5,gamma:17,Es:7500,nu:.35,water:false,color:'#998c7b',description:'Неоднороден: качество уплотнения и история насыпи критичны.'},
 rock:{name:'Скальный грунт',phi:40,c:75,gamma:24,Es:180000,nu:.23,water:false,color:'#7d8589',description:'Условная модель массива; трещиноватость отдельно не учитывается.'}
};
export const FOUND={
 pad:{name:'Столбчатый',icon:'▣',desc:'Отдельные подошвы под колоннами'},
 strip:{name:'Ленточный',icon:'▬',desc:'Непрерывная лента под стенами'},
 raft:{name:'Плита',icon:'▤',desc:'Общая жёсткая плита'},
 piles:{name:'Буронабивные сваи',icon:'║',desc:'Свайное поле под ростверком'},
 screw:{name:'Винтовые сваи',icon:'⚒',desc:'Винтовые сваи и ростверк'}
};
export const BRIDGES=[
 {id:'academy',name:'Учебная ферма',place:'Академия TrussLab',kind:'truss',style:'warren',span:18,n:6,h:3.5,load:42,limit:.065,soil:'gravel',description:'Постройте устойчивую ферму и сравните усилия стержней.',info:'Учебный сценарий: 18 м — игровой размер.'},
 {id:'kerch',name:'Крымский мост',place:'Керченский пролив',kind:'arch',span:40,n:12,h:9.5,load:72,limit:.095,soil:'silt',description:'Детализированный учебный арочный фрагмент с раздельной автодорожной и двухпутной железнодорожной частями.',info:'Реальный переход около 19 км. В TrussLab используется приближённая реконструкция крупного арочного участка и подходов с двухпутной железнодорожной линией.'},
 {id:'paton',name:'Мост Патона',place:'Киев · Днепр',kind:'truss',style:'pratt',span:30,n:8,h:4.5,load:72,limit:.09,soil:'clay',description:'Задача на сварные стальные конструкции и равномерные транспортные нагрузки.',info:'Мост Патона в Киеве — исторический цельносварной мост длиной 1543 м. Игровая ферма стилизована и не повторяет реальные балочные пролёты.'},
 {id:'pivdennyi',name:'Южный мост',place:'Киев · Днепр',kind:'cable',span:40,n:10,h:15,load:84,limit:.13,soil:'sand',description:'Вантовая система: найдите эффективный путь передачи усилий в пилон.',info:'Южный мост — вантовый мост Киева; главный пролёт реального моста — около 271 м. Модель уменьшена.'},
 {id:'metro',name:'Мост Метро',place:'Киев · Днепр',kind:'arch',span:26,n:8,h:5,load:88,limit:.09,soil:'loam',description:'Арочно-балочный учебный пролёт с повышенной нагрузкой от транспорта.',info:'Мост Метро в Киеве включает многоуровневое движение. Здешняя механика — учебная аппроксимация.'},
 {id:'golden',name:'Золотые Ворота',place:'Сан-Франциско · США',kind:'suspension',span:46,n:12,h:17,load:105,limit:.16,soil:'rock',description:'Подвесная схема: тросы, пилоны и жёсткость дорожного полотна.',info:'Golden Gate Bridge имеет основной подвесной пролёт 1280 м. Игровые 46 м и нагрузки не имеют масштаба реального сооружения.'},
 {id:'brooklyn',name:'Бруклинский мост',place:'Нью-Йорк · США',kind:'suspension',span:42,n:12,h:14,load:90,limit:.15,soil:'rock',description:'Исторические каменные пилоны и сочетание подвесной схемы с усилением.',info:'Реальный мост открыт в 1883 году. Конструктивная геометрия условная.'},
 {id:'millau',name:'Виадук Мийо',place:'Франция · долина Тарн',kind:'cable',span:44,n:12,h:18,load:115,limit:.15,soil:'rock',description:'Высокие опоры, вантовая поддержка и распределённый поток транспорта.',info:'Реальный виадук Мийо имеет общую длину 2460 м. В игре — схематичный фрагмент.'},
 {id:'akashi',name:'Акаси-Кайкё',place:'Япония · пролив Акаси',kind:'suspension',span:48,n:12,h:19,load:125,limit:.16,soil:'rock',description:'Длинный учебный подвесной мост с сильным ветром.',info:'Это игровая интерпретация подвесного моста, а не фактическая проектная модель.'},
 {id:'free',name:'Свободный проект',place:'Творческая мастерская',kind:'truss',style:'warren',span:20,n:6,h:4,load:45,limit:.18,soil:'sand',description:'Редактируйте ферму, сечения, материал, опоры и схемы нагрузок.',info:'Песочница не ограничивает бюджет.'}
];
export const FOUNDATION_LEVELS=[
 {id:'sandHouse',name:'Дом на песке',soil:'sand',floors:2,length:11,width:9,budget:26000,desc:'Подберите экономичную основу для двухэтажного дома.'},
 {id:'marshHouse',name:'Дом на болоте',soil:'peat',floors:2,length:10,width:9,budget:49000,desc:'Слабые торфяные грунты требуют проверки осадки и несущей способности.'},
 {id:'clayHouse',name:'Дом на глине',soil:'clay',floors:3,length:12,width:10,budget:38000,desc:'Примите меры против чрезмерной осадки основания.'},
 {id:'siltHouse',name:'Дом у реки',soil:'silt',floors:2,length:14,width:9,budget:45000,desc:'Пылеватый насыщенный водой грунт.'},
 {id:'gravelHouse',name:'Склад на гравии',soil:'gravel',floors:1,length:19,width:12,budget:32000,desc:'Большая площадь и тяжёлые эксплуатационные нагрузки.'},
 {id:'fillHouse',name:'Дом на насыпи',soil:'fill',floors:3,length:11,width:12,budget:52000,desc:'Учитывайте риск неоднородной насыпи.'},
 {id:'rockHouse',name:'Дом на скале',soil:'rock',floors:3,length:13,width:10,budget:38000,desc:'Экономьте материал, используя жёсткое основание.'},
 {id:'soilLab',name:'Геолаборатория',soil:'loam',floors:2,length:12,width:10,budget:1e9,desc:'Свободно меняйте все параметры и сравнивайте фундаменты.'}
];
export function makeBridge(cfg){
 let nodes=[],edges=[],id=1;const A=(x,y,support=0,fx=0,fy=0)=>{let v={id:id++,x,y,support,fx,fy};nodes.push(v);return v.id},B=(a,b,type='rod',m='steel',size=1)=>{if(a!==b&&!edges.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)))edges.push({id:id++,a,b,type,m,size})};
 const n=cfg.n,L=cfg.span,h=cfg.h,dx=L/n,deck=[];
 // Beam deck is a 2D frame with bending stiffness; supported by pins at endpoints.
 for(let i=0;i<=n;i++)deck.push(A(dx*i,3,i===0?1:i===n?2:0,0,(i===0||i===n)?0:-cfg.load));
 for(let i=0;i<n;i++)B(deck[i],deck[i+1],'frame','steel',cfg.kind==='suspension'?2.7:cfg.kind==='cable'?2.8:1.25);
 if(cfg.kind==='truss'){
 let top=[];for(let i=0;i<=n;i++)top.push(A(dx*i,3+h));
 for(let i=0;i<n;i++)B(top[i],top[i+1]);
 for(let i=0;i<=n;i++)B(deck[i],top[i]);
 for(let i=0;i<n;i++)B((cfg.style==='pratt'&&i>=n/2)||cfg.style==='warren'&&i%2?top[i]:deck[i],(cfg.style==='pratt'&&i>=n/2)||cfg.style==='warren'&&i%2?deck[i+1]:top[i+1]);
 }
 if(cfg.kind==='arch'){
 let arch=[];for(let i=0;i<=n;i++)arch.push(i===0?deck[0]:i===n?deck[n]:A(dx*i,3+h*Math.sin(Math.PI*i/n)));
 for(let i=0;i<n;i++)B(arch[i],arch[i+1],'rod','steel',cfg.id==='kerch'?1.95:1.7);
 if(cfg.id==='kerch'){
  for(let i=1;i<n;i++)B(arch[i],deck[i],'rod','steel',.82);
  for(let i=1;i<n;i++){
   if(i<n)B(arch[i],deck[Math.min(n,i+1)],'rod','steel',.56);
   if(i>1)B(arch[i],deck[i-1],'rod','steel',.56);
  }
  for(let i=1;i<n;i+=2){
   if(i<n-1)B(arch[i],arch[i+1],'frame','steel',.78);
   if(i<n)B(deck[i],deck[Math.min(n,i+1)],'frame','steel',1.34);
  }
 }else{
  for(let i=1;i<n;i++)B(arch[i],deck[i],'rod','steel',.85);
 }
 }
 if(cfg.kind==='cable'){
 let center=Math.floor(n/2),t1=A(dx*center,3+h,0),foot=A(dx*center,0,3);B(deck[center],foot,'frame','reinforced',2.5);B(deck[center],t1,'frame','reinforced',2.5);
 let t2=A(dx*center,3+h*.5);B(t1,t2,'frame','reinforced',1.65);
 for(let i=1;i<n;i++)if(Math.abs(i-center)>1&&i%2===0)B(t1,deck[i],'cable','cable',1);
 }
 if(cfg.kind==='suspension'){
 const lt=Math.round(n*.25),rt=n-lt,cable=[];
 for(let i=0;i<=n;i++){
 let yy=3+h*((i<=lt)?(.56+.44*i/lt):(i>=rt?(.56+.44*(n-i)/(n-rt)):(.6+.4*Math.pow(Math.abs(i-(lt+rt)/2)/((rt-lt)/2),2))));
 cable.push(A(dx*i,yy));
 if(i>0)B(cable[i-1],cable[i],'cable','cable',1.6);
 if(i!==0&&i!==n&&i!==lt&&i!==rt)B(cable[i],deck[i],'cable','cable',.75);
 }
 for(let j of [lt,rt]){B(deck[j],cable[j],'frame','reinforced',2.6);B(deck[j],A(dx*j,0,1),'frame','reinforced',2.5)}
 B(deck[0],cable[0],'cable','cable',1.1);B(deck[n],cable[n],'cable','cable',1.1);
 }
 const price=edges.reduce((s,e)=>{let a=nodes.find(v=>v.id===e.a),b=nodes.find(v=>v.id===e.b);return s+Math.hypot(a.x-b.x,a.y-b.y)*MAT[e.m].price*e.size},0);
 return {nodes,edges,meta:{id:cfg.id,kind:cfg.kind,budget:cfg.id==='free'?999999:Math.round(price*1.23),span:L,load:cfg.load,limit:cfg.limit},nextId:id};
}
