import { C64Computer } from '../world/C64Computer.js';
import { makeRetroScreenMaterial } from '../world/PortalRetroScreens.js';
import { buildRecipe } from '../world/PortalInteriorRecipe.js';
let screens;
export function repositoryRetroScreen(kind){
 screens??=new Map(buildRecipe().screens.map(s=>[s.id,s]));
 return makeRetroScreenMaterial(screens.get(kind));
}
// Reuse the installed game's actual C64 login and BASIC interpreter. Runtime state stays out of world Git.
export class RepositoryRetro{
 constructor(input,{canResume=()=>true,canCommand=()=>true,canExecute=()=>true}={}){this.canResume=canResume;this.canCommand=canCommand;this.canExecute=canExecute;this.input=input;this.computers=new Map();this.activeWorld=null;}
 get active(){return [...this.computers.values()].some(c=>c.active);}
 setWorld(active){if(active===this.activeWorld)return;this.clear();this.activeWorld=active;}
 nearest(cameraPosition){let found=null,best=Infinity;for(const t of this.activeWorld?.project.terminals??[]){const d=Math.hypot(...t.position.map((v,i)=>v-cameraPosition.getComponent(i)));if(d<t.interactionRadius&&d<best){found=t;best=d;}}return found;}
 open(terminal){if(terminal.kind!=='c64')return false;let computer=this.computers.get(terminal.id);if(!computer){computer=new C64Computer({input:this.input,canResume:this.canResume,canCommand:this.canCommand,canExecute:this.canExecute});this.computers.set(terminal.id,computer);}computer.open();return true;}
 clear({resume=false}={}){for(const computer of this.computers.values()){if(computer.active)computer.close({resume});computer.dialog.remove();}this.computers.clear();this.activeWorld=null;}
 dispose(){this.clear();}
}
