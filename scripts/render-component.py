"""Offline inspection of the actual cached preview mesh and its vertex normals."""
import bpy,sys,struct,math
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];name=args[0];view=args[1] if len(args)>1 else 'perspective'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
data=open('src/generated/'+name+'.bin','rb').read();nv,ni=struct.unpack_from('<II',data)
p=struct.unpack_from('<'+'f'*(nv*3),data,8);n=struct.unpack_from('<'+'f'*(nv*3),data,8+nv*12);idx=struct.unpack_from('<'+'I'*ni,data,8+nv*24)
# Three Y-up to Blender Z-up, preserving handedness.
verts=[(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)];normals=[(n[i],-n[i+2],n[i+1]) for i in range(0,len(n),3)]
mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[idx[i:i+3] for i in range(0,ni,3)]);mesh.update()
for face in mesh.polygons:face.use_smooth=True
mesh.normals_split_custom_set_from_vertices(normals)
o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
mat=bpy.data.materials.new('blue plastic');mat.diffuse_color=(.015,.19,.65,1);mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=mat.diffuse_color;bs.inputs['Roughness'].default_value=.27;o.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.world.color=(.45,.45,.45)
for pos,power,size in [((0,-80,180),200000,110),((-90,30,90),90000,80),((100,100,40),130000,65)]:
 d=bpy.data.lights.new('softbox','AREA');d.energy=power;d.shape='DISK';d.size=size;l=bpy.data.objects.new('softbox',d);bpy.context.collection.objects.link(l);l.location=pos;l.rotation_euler=(Vector((0,0,25))-l.location).to_track_quat('-Z','Y').to_euler()
lo=Vector(tuple(min(p[i] for p in verts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in verts) for i in range(3)));target=(lo+hi)/2;directions={'perspective':(135,-175,160),'top':(0,0,300),'side':(0,-300,0),'end':(300,0,0),'underside':(0,0,-300)}
d=bpy.data.cameras.new('camera');c=bpy.data.objects.new('camera',d);bpy.context.collection.objects.link(c);c.location=target+Vector(directions[view]);c.rotation_euler=(target-c.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=max(hi-lo)*1.5;scene.camera=c
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath='tmp/'+name+'-'+view+'.png';scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
