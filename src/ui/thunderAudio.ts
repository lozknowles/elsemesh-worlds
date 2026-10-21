// Created only from an explicit Enable thunder audio click; no autoplay/network.
export function createThunderAudio() {
  const context=new AudioContext();
  let closed=false;
  void context.resume();
  return {
    play() {
      if(closed || context.state!=='running') return;
      const duration=3.5, sampleRate=context.sampleRate;
      const buffer=context.createBuffer(1,Math.floor(duration*sampleRate),sampleRate);
      const data=buffer.getChannelData(0);
      let state=8411, low=0;
      for(let i=0;i<data.length;i++) { state=(Math.imul(state,1664525)+1013904223)|0;const white=(state>>>0)/4294967295*2-1;low=low*.965+white*.035;const t=i/sampleRate;data[i]=low*Math.min(1,t*12)*Math.exp(-t*.9)*2; }
      const source=context.createBufferSource();source.buffer=buffer;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=550;
      const gain=context.createGain();gain.gain.value=.55;
      source.connect(filter).connect(gain).connect(context.destination);source.start(context.currentTime+.65);
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    },
    close() {closed=true;void context.close();},
  };
}
