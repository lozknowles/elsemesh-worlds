import { test, expect } from '@playwright/test';
import { createWorld, type EditorObject } from '../src/domain/world';
import { resolveWorldMatrices } from '../src/domain/object-hierarchy';

test('native hierarchy retains exact composed transforms',async({page})=>{
 test.setTimeout(90000);
 const world=createWorld('Native hierarchy acceptance');world.terrain.heights.fill(0);world.environment.mistDensity=0;
 const group:EditorObject={id:'parent',name:'Rotated scaled parent',kind:'group',position:[3,2,-4],rotation:[0,.6,0],scale:[2,1,3],visible:true,color:'#ffffff',collision:'none'};
 const child:EditorObject={id:'child',parentId:'parent',name:'Rotated child',kind:'box',position:[1,1,2],rotation:[.1,.4,0],scale:[1,2,1],visible:true,color:'#efaa44',collision:'solid'};
 world.objects=[group,child];
 await page.goto('/');await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'hierarchy.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
 await page.getByRole('button',{name:/ElseMesh graphics/}).click();
 const frame=page.frameLocator('iframe[title="ElseMesh native WebGPU preview"]');
 await expect(frame.locator('#status')).toContainText('drag to look',{timeout:45000});
 const native=page.frames().find(frame=>frame.url().includes('native-preview.html'))!;
 const diagnostics=await native.evaluate(()=> (window as unknown as {__nativePreview?:{hierarchyMatrices?:Record<string,number[]>}}).__nativePreview?.hierarchyMatrices);
 expect(diagnostics).toBeDefined();
 const expected=resolveWorldMatrices(world.objects).get('child')!.elements;
 expect(diagnostics!.child).toHaveLength(16);
 diagnostics!.child!.forEach((value,index)=>expect(value).toBeCloseTo(expected[index]!,6));
 await page.screenshot({path:'.local-evidence/native-hierarchy.png'});
});
