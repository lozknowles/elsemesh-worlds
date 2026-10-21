import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorld, validateWorld } from '../src/domain/world';
import type { WorldProject } from '../src/domain/world';

function demoWorld(): WorldProject {
  const world=createWorld('Water garden · weather demonstration');
  const terrain=world.terrain;
  for(let z=0;z<terrain.resolution;z++) for(let x=0;x<terrain.resolution;x++) {
    const wx=x*terrain.width/(terrain.resolution-1)-terrain.width/2;
    const wz=z*terrain.depth/(terrain.resolution-1)-terrain.depth/2;
    const depression=Math.exp(-((wx+12)**2/600+(wz-4)**2/400));
    terrain.heights[z*terrain.resolution+x]=3.5+2*Math.sin(wx*.08)*Math.cos(wz*.07)+7*(1-depression);
  }
  world.features=[
    {id:'lake-demo',name:'Lower lake',kind:'lake',points:[[-31,6,-8],[4,6,-8],[7,6,18],[-30,6,20]],width:10,elevation:6},
    {id:'river-in',name:'Upper river',kind:'river',points:[[-8,14,-38],[-13,13,-25],[-12,12,-9]],width:4},
    {id:'fall-demo',name:'Falls to lake',kind:'waterfall',points:[[-12,12,-7]],width:5,drop:6},
    {id:'river-out',name:'Lower stream',kind:'river',points:[[-12,6,18],[-15,5,28],[-21,4,38]],width:3,startLakeId:'lake-demo'},
    {id:'bridge-demo',name:'Timber bridge',kind:'bridge',points:[[-24,7,8],[-2,7,8]],width:2,elevation:7},
    {id:'path-demo',name:'Garden path',kind:'path',points:[[-40,0,22],[-33,0,10],[-24,0,8]],width:2},
    {id:'shape-demo',name:'Picnic platform',kind:'shape',points:[[-38,12,3],[-32,12,3],[-32,12,8],[-38,12,8]],width:1},
  ];
  world.objects=(['broadleaf','palm','pine'] as const).map((species,i)=>({id:`tree-${species}`,name:`${species} tree`,kind:'tree',position:[-35+i*17,11,-10-i*7],rotation:[0,i*.4,0],scale:[1.5,1.5,1.5],color:'#427744',visible:true,collision:'solid',treeSpecies:species,treeSeed:7319+i*113}));
  world.environment={...world.environment,timeOfDay:14,mistDensity:.001,weather:'clear',rainIntensity:.85,windSpeed:9,weatherSeed:7341};
  return world;
}

test('native water, trees and thunderstorm visibly animate with bounded rain and no GPU errors',async({page})=>{
  test.setTimeout(100000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const out=path.resolve('../../outputs');mkdirSync(out,{recursive:true});
  const world=demoWorld();expect(validateWorld(world).errors).toEqual([]);
  writeFileSync(path.join(out,'weather-water-demo.emw'),JSON.stringify(world,null,2));
  await page.goto('/');
  await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'weather-water-demo.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
  await expect(page.getByText('Water garden · weather demonstration').first()).toBeVisible();
  await page.getByRole('button',{name:'ElseMesh graphics'}).click();
  const native=page.frames().find(f=>f.url().includes('native-preview.html'))!;
  const read=()=>native.evaluate(()=> (window as unknown as {__nativePreview?:{frames:number;time:number;features:number;objects:number;weather:{particles:number;flash:number;event:number}}}).__nativePreview);
  await expect.poll(async()=> (await read())?.frames??0,{timeout:45000}).toBeGreaterThan(30);
  await page.waitForTimeout(2000);
  expect((await read())?.features).toBe(7);expect((await read())?.objects).toBe(3);
  await page.screenshot({path:path.join(out,'native-water-trees-a.png')});
  await page.waitForTimeout(1600);
  await page.screenshot({path:path.join(out,'native-water-trees-b.png')});
  await page.getByRole('combobox',{name:'Weather',exact:true}).selectOption('storm');
  await expect.poll(async()=> (await read())?.weather.particles??0).toBe(765);
  await page.waitForTimeout(1500);
  await page.screenshot({path:path.join(out,'native-thunderstorm-rain.png')});
  await expect.poll(async()=> (await read())?.weather.flash??0,{timeout:20000,intervals:[16]}).toBeGreaterThan(.2);
  const lightningState=await read();
  await page.screenshot({path:path.join(out,'native-thunderstorm-lightning.png')});
  await page.getByRole('button',{name:'Enable thunder audio'}).click();
  await expect(page.getByRole('button',{name:'Mute thunder audio'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Mute thunder audio'}).click();
  await page.getByRole('combobox',{name:'Weather',exact:true}).selectOption('clear');
  await expect.poll(async()=> (await read())?.weather.particles??-1).toBe(0);
  await page.getByRole('combobox',{name:'Weather',exact:true}).selectOption('storm');
  await page.waitForTimeout(500);
  await page.getByRole('button',{name:'Back to editor ×'}).click();
  await expect(page.getByRole('button',{name:'Enter preview'})).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(out,'editor-water-trees-rain.png')});
  writeFileSync(path.join(out,'native-weather-evidence.json'),JSON.stringify({errors,lightningState,rainCap:900,audio:'opt-in button enabled/muted; synthesized audio was not human-listened'},null,2));
  expect(errors).toEqual([]);
});
