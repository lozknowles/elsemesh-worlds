import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorld, validateWorld } from '../domain/world';
import PortalPanel from './PortalPanel';
import { configuredGameUrl, createEditorPortal, portalDestinationStatus } from './portal-editing';

describe('authored portal editor',()=>{
  it('creates a valid opening at an explicit aperture centre without changing its world',()=>{
    const project=createWorld('Editor'),before=structuredClone(project),portal=createEditorPortal(project,[4,3.25,-9],'elsemesh-portal:fixture');
    expect(project).toEqual(before);expect(portal.position).toEqual([4,3.25,-9]);
    expect(portal.width).toBe(2);expect(portal.height).toBe(2.5);expect(portal.id).toBe('elsemesh-portal:fixture');
    expect(validateWorld({...project,portals:[portal]}).valid).toBe(true);
  });
  it('distinguishes broken local references from unverified external and valid local destinations',()=>{
    const project=createWorld(),source=createEditorPortal(project,[0,1.25,0]),target=createEditorPortal(project,[8,1.25,0]);
    project.portals=[source,target];
    expect(portalDestinationStatus(project,source).text).toMatch(/checked in the game/);
    source.destination={worldId:project.metadata.worldId,regionId:'elsemesh.region:missing',portalId:target.id};
    expect(portalDestinationStatus(project,source).valid).toBe(false);
    source.destination.regionId=project.metadata.regionId;expect(portalDestinationStatus(project,source).valid).toBe(true);
    source.destination.portalId='elsemesh-portal:missing';expect(portalDestinationStatus(project,source).valid).toBe(false);
  });
  it('renders discoverable numeric aperture and destination fields with explicit game status',()=>{
    const project=createWorld(),portal=createEditorPortal(project,[0,1.25,0]);project.portals=[portal];
    const html=renderToStaticMarkup(createElement(PortalPanel,{project,selectedId:portal.id,onSelect:()=>{},onAdd:()=>{},onUpdate:()=>{},onDelete:()=>{}}));
    for(const text of ['Opening width','Opening height','Portal yaw','Destination world ID','Destination region ID','Destination portal ID','Portal policy reference','Apply portal changes','Actual game URL','Unsaved editor changes stay here']) expect(html).toContain(text);
    expect(html).not.toContain('Live connection');
  });
  it('accepts only credential-free HTTP/HTTPS game launch URLs',()=>{
    expect(configuredGameUrl('https://game.example/play')).toBe('https://game.example/play');
    for(const value of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@game.example','not a URL']) expect(configuredGameUrl(value)).toBeNull();
  });
});
