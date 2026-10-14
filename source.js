const {Plugin,Modal,Setting,Notice,requestUrl}=require('obsidian');
const tar=require('tar-stream'),zlib=require('zlib'),TD=require('turndown'),{gfm}=require('turndown-plugin-gfm'),YAML=require('yaml');
const safe=s=>String(s||'未命名').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+$/,'_').slice(0,100);
async function unpack(buffer){
 if(buffer[0]===31&&buffer[1]===139)buffer=zlib.gunzipSync(buffer,{maxOutputLength:512*1024*1024});
 const files=new Map();let total=0;
 await new Promise((resolve,reject)=>{const ex=tar.extract();ex.on('error',reject);ex.on('finish',resolve);ex.on('entry',(h,s,next)=>{let chunks=[];s.on('data',b=>{total+=b.length;if(total>512*1024*1024){ex.destroy(new Error('解包超过512MB限制'));s.destroy();return;}chunks.push(b)});s.on('error',reject);s.on('end',()=>{if(h.type==='file')files.set(h.name.replace(/^\.\//,''),Buffer.concat(chunks));next()});s.resume()});ex.end(buffer)});return files;
}
function convert(html,warnings){
 const dom=new DOMParser().parseFromString(html,'text/html');dom.querySelectorAll('script,style,iframe').forEach(x=>x.remove());
 for(const c of dom.querySelectorAll('card')){let v={};try{v=JSON.parse(decodeURIComponent((c.getAttribute('value')||'').replace(/^data:/,'')))}catch{}
 const name=c.getAttribute('name');let node=dom.createElement('p');
 if(name==='codeblock'){node=dom.createElement('pre');const code=dom.createElement('code');code.className='language-'+(v.mode||'');code.textContent=v.code||'';node.append(code)}
 else if(name==='image'){node=dom.createElement('img');node.setAttribute('src',v.src||v.url||'');node.setAttribute('alt',v.alt||v.name||'')}
 else if(name==='math'){node.textContent='$$'+(v.code||v.value||v.text||'')+'$$'}
 else {node.textContent='[未转换卡片：'+name+']';warnings.push('未转换卡片：'+name)}c.replaceWith(node)
 }
 const td=new TD({headingStyle:'atx',codeBlockStyle:'fenced'});td.use(gfm);return {dom,td};
}
class ImportModal extends Modal{constructor(app,plugin){super(app);this.plugin=plugin}onOpen(){this.contentEl.createEl('h2',{text:'导入语雀 Lakebook'});this.contentEl.createEl('p',{text:'本地解析，无需 Token。每次创建新文件夹，原始数据同时保留。'});const f=this.contentEl.createEl('input',{type:'file',attr:{accept:'.lakebook,.lakbook,.tar,.gz'}});let download=true;new Setting(this.contentEl).setName('下载远程图片').setDesc('访问文档中的 HTTPS 图片链接；失败保留原链接并记录。').addToggle(t=>t.setValue(true).onChange(v=>download=v));const status=this.contentEl.createEl('p');new Setting(this.contentEl).addButton(b=>b.setButtonText('开始导入').setCta().onClick(async()=>{if(!f.files.length)return new Notice('请先选择文件');b.setDisabled(true);try{await this.plugin.importFile(f.files[0],download,t=>status.textContent=t);status.textContent='导入完成，请查看目录与导入报告。'}catch(e){status.textContent='导入失败：'+e.message;new Notice(status.textContent)}finally{b.setDisabled(false)}}))}}
module.exports=class extends Plugin{
 onload(){this.addCommand({id:'import-lakebook',name:'导入语雀 .lakebook',callback:()=>new ImportModal(this.app,this).open()});this.addRibbonIcon('file-input','导入语雀 Lakebook',()=>new ImportModal(this.app,this).open())}
 async importFile(file,download,status){
 const files=await unpack(Buffer.from(await file.arrayBuffer()));const metaEntry=[...files].find(([k])=>k.split('/').pop()==='$meta.json');if(!metaEntry)throw Error('找不到 $meta.json，请选择语雀知识库导出包');let meta=JSON.parse(metaEntry[1].toString()).meta;if(typeof meta==='string')meta=JSON.parse(meta);if(!meta||!Array.isArray(meta.docs))throw Error('不支持的 metadata 结构');
 const docs=meta.docs;let toc=[];try{toc=YAML.parse(meta.book?.tocYml||'')||[]}catch{}const nodes=new Map(toc.map(n=>[n.uuid,n]));
 const vault=this.app.vault;const base='语雀导入/'+safe(file.name.replace(/\.(?:lakebook|lakbook)$/,''));let root=base,rootNumber=2;while(vault.getAbstractFileByPath(root))root=base+' ('+rootNumber+++')';
 const mkdir=async p=>{let acc='';for(const part of p.split('/')){acc=acc?acc+'/'+part:part;if(!vault.getAbstractFileByPath(acc))await vault.createFolder(acc)}};await mkdir(root+'/attachments');await mkdir(root+'/原始数据');
 let warnings=[],paths=new Map(),index=[];const prefix=metaEntry[0].slice(0,-'$meta.json'.length);
 const used=new Set(['目录.md','导入报告.md','attachments','原始数据']);
 const allocate=(parent,name,ext='')=>{let path=parent+'/'+safe(name)+ext,n=2;while(used.has(path.toLowerCase()))path=parent+'/'+safe(name)+' ('+n+++')'+ext;used.add(path.toLowerCase());return path};
 const folders=new Map();const folderFor=(id,chain=new Set())=>{if(!id)return root;if(folders.has(id))return folders.get(id);if(chain.has(id)){warnings.push('目录循环，已移到根目录');return root}chain.add(id);const n=nodes.get(id);if(!n)return root;const path=allocate(folderFor(n.parent_uuid,chain),n.title);folders.set(id,path);return path};
 used.add((root+'/目录.md').toLowerCase());used.add((root+'/导入报告.md').toLowerCase());used.add((root+'/attachments').toLowerCase());used.add((root+'/原始数据').toLowerCase());
 for(const d of docs){const n=toc.find(n=>n.url===d.slug);paths.set(d.slug,allocate(folderFor(n?.parent_uuid),d.title,'.md'))}
 const cache=new Map();let i=0;
 for(const info of docs){status(`正在导入 ${++i}/${docs.length}：${info.title}`);try{
 const bytes=files.get(prefix+info.slug+'.json');if(!bytes)throw Error('缺少文档 JSON');const obj=JSON.parse(bytes.toString());const d=obj.doc||obj;await vault.create(allocate(root+'/原始数据',info.title,'.json'),bytes.toString());
 let text=d.body||d.body_draft||'';
 if(d.body_html||d.body_lake||d.format==='lake'){
 const {dom,td}=convert(d.body_html||d.body_lake||d.body||d.body_draft||'',warnings);
 for(const img of dom.querySelectorAll('img')){const src=img.getAttribute('src');if(!src)continue;try{
 let dest=cache.get(src);if(!dest){let bytes=files.get(src)||files.get(prefix+src);let ext=src.split('?')[0].match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)?.[0];
 if(!bytes&&download&&src.startsWith('https://')){const r=await requestUrl({url:src,throw:false});if(r.status!==200)throw Error('HTTP '+r.status);const type=r.headers['content-type']||'';if(!type.startsWith('image/'))throw Error('不是图片');bytes=Buffer.from(r.arrayBuffer);ext=ext||({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg'}[type.split(';')[0]]||'.png')}
 if(!bytes)continue;if(bytes.length>100*1024*1024)throw Error('图片超过100MB');dest=allocate(root+'/attachments','图片'+String(cache.size+1).padStart(3,'0'),ext||'.bin');await vault.createBinary(dest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));cache.set(src,dest)}img.setAttribute('src',encodeURI(dest));
 }catch(e){warnings.push(info.title+' 图片失败：'+src+' '+e.message)}}
 for(const a of dom.querySelectorAll('a[href]')){const href=a.getAttribute('href');const slug=href.split('#')[0].split('/').pop();if(paths.has(slug))a.setAttribute('href',encodeURI(paths.get(slug)))}text=td.turndown(dom.body.innerHTML);
 }
 if(!text){text='此文档类型无法转为 Markdown，请查看原始 JSON。';warnings.push(info.title+'：无法转换 '+d.format)}const path=paths.get(info.slug);await mkdir(path.slice(0,path.lastIndexOf('/')));await vault.create(path,'---\nyuque_slug: '+JSON.stringify(info.slug)+'\n---\n\n# '+info.title+'\n\n'+text);index.push('- [['+path.replace(/\.md$/,'')+'|'+info.title+']]');
 }catch(e){warnings.push(info.title+'：'+e.message)}}
 await vault.create(root+'/目录.md','# '+safe(file.name)+'\n\n'+index.join('\n'));await vault.create(root+'/导入报告.md','# 导入报告\n\n成功：'+index.length+'/'+docs.length+'\n\n'+(warnings.map(w=>'- '+w).join('\n')||'无警告'));new Notice('导入完成：'+index.length+' 篇');
 }
};
module.exports.unpack=unpack;module.exports.convert=convert;
