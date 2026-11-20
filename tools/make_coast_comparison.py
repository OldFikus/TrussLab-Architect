from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
root=Path(__file__).resolve().parent.parent
N=512
import subprocess
js="import {sampleGeoLand} from './js/geo_mask.js';const N=512,S=420,b=Buffer.alloc(N*N);for(let j=0;j<N;j++)for(let i=0;i<N;i++)b[j*N+i]=Math.round(255*sampleGeoLand(S*((i+.5)/N-.5),S*((j+.5)/N-.5),S));process.stdout.write(b);"
try:
    raw=subprocess.check_output(['node','--input-type=module','-e',js],cwd=root)
except (OSError,subprocess.CalledProcessError) as ex:
    print('Node.js needed for comparison preview:',ex);raise SystemExit(1)
trace=Image.frombytes('L',(N,N),raw)
real=Image.open(root/'assets/gshhg_shoreline_preview.png').convert('L')
img=Image.new('RGB',(N*2+40,N+80),'#152c3b')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
font2=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
d=ImageDraw.Draw(img)
for ix,(mask,title,subtitle) in enumerate([(trace,'По снимку пользователя','Визуальная трассировка'),(real,'GSHHG (среднее разрешение)','Цифровой региональный берег')]):
    rgba=Image.new('RGB',(N,N),(22,72,98));land=Image.new('RGB',(N,N),(102,124,81));rgba.paste(land,(0,0),mask)
    x=13+ix*(N+14);img.paste(rgba,(x,50))
    d.text((x+4,12),title,font=font,fill='#f1ede1');d.text((x+5,N+58),subtitle,font=font2,fill='#bed5d6')
img.save(root/'assets/coast_sources_comparison.png')
