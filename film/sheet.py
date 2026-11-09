import sys, subprocess, os
ff=os.path.expanduser('~/.local/bin/ffmpeg')
out=sys.argv[1]; ts=sys.argv[2:]
args=[ff,'-v','error','-y']
for t in ts: args+=['-i',f'still_{t}.jpg']
fc=''.join(f'[{i}]scale=288:512,drawtext=text=\'{t}s\':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[v{i}];' for i,t in enumerate(ts))
fc+=''.join(f'[v{i}]' for i in range(len(ts)))+f'hstack={len(ts)}'
subprocess.run(args+['-filter_complex',fc,out],check=True)
