import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NewDiverProfile() {
  const navigate = useNavigate();
  return (
    <div className="bg-dp-background text-dp-on-background font-body selection:bg-dp-secondary selection:text-black pb-32 min-h-screen">
      
<header className="bg-transparent backdrop-blur-md dark:bg-black/60 docked full-width top-0 z-50 border-b-4 border-[#767575] shadow-[0_8px_0_0_rgba(0,0,0,1)] flex items-center justify-between px-6 h-20 w-full sticky">
<div className="flex items-center gap-4">
<button className="text-[#b6a0ff] hover:scale-110 transition-transform duration-200 active:scale-95 active:rotate-[-1.5deg]">
<span className="material-symbols-outlined text-3xl">arrow_back</span>
</button>
<h1 className="text-[#b6a0ff] font-['Space_Grotesk'] font-bold tracking-tighter uppercase text-xl">DIVER_PROFILE</h1>
</div>
<button className="text-[#b6a0ff] hover:scale-110 transition-transform duration-200 active:scale-95 active:rotate-[-1.5deg]">
<span className="material-symbols-outlined text-3xl">settings</span>
</button>
</header>
<main className="max-w-5xl mx-auto px-6 pt-12 space-y-12">
<section className="flex flex-col md:flex-row items-center gap-10">
<div className="relative wonky-1">
<div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden hand-drawn-border bg-dp-surface-container-high p-1">
<img className="w-full h-full object-cover rounded-full" data-alt="Diver with high-end retro scuba gear" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzGjOxKqFNkF--dH_31wp5okpuxljO9DYCJuWtsHSef_nFgNtv7dmcdd6brb5vaX7wJZVQM5TDduu0iyYM_cYEeZaglVL2RqMjfIX1kK6eUVYmUmb-5yZ0e86eWsd8ycgB8WvVxpvKY8EY4jpP7Oc4nB8MPU3gSNRtaKR-oZqUQI025B1XQ654kpNBu9gJSMuCXf56sPhY6Jhm0pKDl7UdSgZv--xiQkuXGX61Y_ehod8MLp16Z0jEjgtMFuQbcrWoNd5UXCNqAmPz"/>
</div>
<div className="absolute -bottom-4 -right-4 bg-dp-tertiary text-black font-headline font-black px-6 py-2 wonky-2 sticker-border shadow-[4px_4px_0_0_#ffffff]">
                    PRO DIVER
                </div>
</div>
<div className="flex-1 text-center md:text-left space-y-4">
<h2 className="font-headline text-5xl md:text-7xl font-black tracking-tighter text-dp-primary italic uppercase">AXEL NEON</h2>
<p className="font-body text-dp-on-surface-variant text-lg max-w-md">Exploring the bioluminescent depths of the midnight zone since 2018. Professional shark whisperer and night owl.</p>
<div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
<span className="bg-dp-surface-container-high px-4 py-1 rounded-full text-dp-secondary font-bold text-sm sticker-border border-dp-secondary/30">MASTER SCUBA</span>
<span className="bg-dp-surface-container-high px-4 py-1 rounded-full text-dp-primary font-bold text-sm sticker-border border-dp-primary/30">NITROX CERTIFIED</span>
</div>
</div>
</section>
<section className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="bg-dp-surface-container-low p-8 rounded-xl wonky-1 border-4 border-dp-primary shadow-[8px_8px_0_0_#7e51ff] flex flex-col items-center justify-center text-center">
<span className="font-headline text-dp-secondary text-sm font-bold tracking-widest uppercase mb-2">Total Dives</span>
<span className="font-headline text-6xl md:text-8xl font-black text-white drop-shadow-[0_0_15px_rgba(182,160,255,0.6)]">482</span>
</div>
<div className="bg-dp-surface-container-low p-8 rounded-xl wonky-2 border-4 border-dp-secondary shadow-[8px_8px_0_0_#006875] flex flex-col items-center justify-center text-center">
<span className="font-headline text-dp-primary text-sm font-bold tracking-widest uppercase mb-2">Bottom Time</span>
<div className="flex items-baseline gap-2">
<span className="font-headline text-6xl md:text-8xl font-black text-white drop-shadow-[0_0_15px_rgba(0,227,253,0.6)]">312</span>
<span className="font-headline text-2xl font-bold text-dp-secondary">HRS</span>
</div>
</div>
</section>
<section className="space-y-6">
<h3 className="font-headline text-3xl font-black tracking-tight text-white flex items-center gap-3">
<span className="w-8 h-1 bg-dp-tertiary"></span> SKILL PATCHES
            </h3>
<div className="flex flex-wrap gap-8 justify-around p-8 bg-dp-surface-container-highest rounded-xl wonky-1">
<div className="group flex flex-col items-center gap-3 transition-transform hover:scale-110">
<div className="w-24 h-24 rounded-full bg-dp-surface-container p-1 sticker-border shadow-lg">
<div className="w-full h-full rounded-full bg-[#131313] flex items-center justify-center text-dp-tertiary">
<span className="material-symbols-outlined text-5xl">dark_mode</span>
</div>
</div>
<span className="font-headline text-xs font-bold tracking-widest uppercase">Night Owl</span>
</div>
<div className="group flex flex-col items-center gap-3 transition-transform hover:scale-110">
<div className="w-24 h-24 rounded-full bg-dp-surface-container p-1 sticker-border shadow-lg">
<div className="w-full h-full rounded-full bg-[#131313] flex items-center justify-center text-dp-secondary">
<span className="material-symbols-outlined text-5xl" style={{fontVariationSettings: "'FILL' 1"}}>surfing</span>
</div>
</div>
<span className="font-headline text-xs font-bold tracking-widest uppercase text-center">Shark whispering</span>
</div>
<div className="group flex flex-col items-center gap-3 transition-transform hover:scale-110">
<div className="w-24 h-24 rounded-full bg-dp-surface-container p-1 sticker-border shadow-lg">
<div className="w-full h-full rounded-full bg-[#131313] flex items-center justify-center text-dp-primary">
<span className="material-symbols-outlined text-5xl">waves</span>
</div>
</div>
<span className="font-headline text-xs font-bold tracking-widest uppercase">Deep Diver</span>
</div>
<div className="group flex flex-col items-center gap-3 transition-transform hover:scale-110">
<div className="w-24 h-24 rounded-full bg-dp-surface-container p-1 sticker-border shadow-lg">
<div className="w-full h-full rounded-full bg-[#131313] flex items-center justify-center text-yellow-400">
<span className="material-symbols-outlined text-5xl" style={{fontVariationSettings: "'FILL' 1"}}>stars</span>
</div>
</div>
<span className="font-headline text-xs font-bold tracking-widest uppercase">Elite Status</span>
</div>
</div>
</section>
<section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
<div className="lg:col-span-2 space-y-6">
<h3 className="font-headline text-3xl font-black tracking-tight text-white flex items-center gap-3">
<span className="w-8 h-1 bg-dp-secondary"></span> LOG CAPTURES
                </h3>
<div className="grid grid-cols-2 gap-4">
<div className="relative rounded-xl overflow-hidden wonky-2 group aspect-square">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" data-alt="Colorful coral reef underwater photography" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-M9CHtdCZVCVzfjdPug41Yy1PzL4CxkS52BvFYgWIpJ-rsNDRnFWe4_HVE4RzFfA1OJh4xKu98ugzTxONbMhC4WZ1DlA9x_o-XyQ5dkSc0_If5EEP0RQezX_PDZAud4kUSPqsFXS7RK6N44jigEir_BgXQnfCxdewUbZiqnFS6mtT2cQTqxoQ4Zqhw-zrhYwUy9sof7hWlsd-wMbN-rXHwhbdumzxEJm8HQH_2PmSuYk53Rf4CfO9rGV80EF5teW9AX6bBYHkjjf4"/>
<div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase border border-white/20">
                            BORA BORA
                        </div>
</div>
<div className="relative rounded-xl overflow-hidden wonky-1 group aspect-square">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" data-alt="Deep sea bioluminescent jellyfish" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBHyRO_y5Hurvux1yEp6NMhM37Fk54zTF_rZ70bkXP5aav1ZWXYzHjqeb3nFqhkGqPEAneYMjsSzMclqWaHnoSNiIBWrlvwqJZqoROj3ggs7U03Bc3R19lc4Ld64xmqetbhyJnc3mz23R8CaZZ9YFzJur1AbwyVW8i0s3zj7Ahe7NpSCUS7BdTNlq9XsC9hvXGf2RTHxo0iQZ_FMvPh9IbazqYVFvfAOYHuFf6pZRQRYdcc2nrsL38Tkb38EmakZkHIdWirIlH2YOBR"/>
<div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase border border-white/20">
                            NEON GARDENS
                        </div>
</div>
</div>
</div>
<div className="space-y-6">
<h3 className="font-headline text-3xl font-black tracking-tight text-white">LAST IMMERSION</h3>
<div className="bg-dp-surface-container-high border-4 border-[#767575] rounded-xl p-6 wonky-2 shadow-[12px_12px_0_0_rgba(0,0,0,1)] relative overflow-hidden">
<div className="absolute -top-10 -right-10 w-32 h-32 bg-dp-primary/10 rounded-full blur-3xl"></div>
<div className="flex justify-between items-start mb-6">
<div>
<p className="text-[10px] font-black text-dp-on-surface-variant tracking-[0.2em] uppercase">Status</p>
<div className="flex items-center gap-2 mt-1">
<span className="w-2 h-2 rounded-full bg-dp-secondary animate-pulse"></span>
<span className="font-headline text-dp-secondary font-black tracking-tighter italic">COMPLETED</span>
</div>
</div>
<span className="material-symbols-outlined text-dp-primary text-3xl">scuba_diving</span>
</div>
<div className="space-y-4">
<div className="flex justify-between border-b border-dp-outline-variant pb-2">
<span className="text-xs font-bold text-dp-on-surface-variant uppercase">Max Depth</span>
<span className="font-headline font-bold text-white">42.5m</span>
</div>
<div className="flex justify-between border-b border-dp-outline-variant pb-2">
<span className="text-xs font-bold text-dp-on-surface-variant uppercase">Duration</span>
<span className="font-headline font-bold text-white">52 min</span>
</div>
<div className="flex justify-between border-b border-dp-outline-variant pb-2">
<span className="text-xs font-bold text-dp-on-surface-variant uppercase">Mix</span>
<span className="font-headline font-bold text-white">Nitrox 32%</span>
</div>
</div>
<button className="w-full mt-6 bg-dp-primary text-black font-headline font-black py-3 rounded-lg hover:bg-dp-primary-dim transition-colors uppercase tracking-widest text-xs">
                        View Full Log
                    </button>
</div>
</div>
</section>
</main>
<nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-4 bg-[#131313] dark:bg-[#131313] border-t-4 border-[#767575] tonal-shift bg-[#20201f] shadow-[0_-10px_40px_rgba(126,81,255,0.08)]">
<a className="flex flex-col items-center justify-center text-[#767575] p-2 hover:text-[#ff716c] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">tsunami</span>
<span className="font-['Manrope'] font-bold text-[10px] tracking-widest uppercase mt-1">LOGS</span>
</a>
<a className="flex flex-col items-center justify-center text-[#767575] p-2 hover:text-[#ff716c] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">explore</span>
<span className="font-['Manrope'] font-bold text-[10px] tracking-widest uppercase mt-1">MAP</span>
</a>
<a className="flex flex-col items-center justify-center bg-[#b6a0ff] text-black rounded-xl rotate-[-2deg] p-3 scale-110 shadow-[4px_4px_0_0_#ffffff] animate-[spring_0.4s_cubic-bezier(0.34,1.56,0.64,1)]" href="#">
<span className="material-symbols-outlined text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>person_pin</span>
<span className="font-['Manrope'] font-bold text-[10px] tracking-widest uppercase mt-1">DIVER</span>
</a>
<a className="flex flex-col items-center justify-center text-[#767575] p-2 hover:text-[#ff716c] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">scuba_diving</span>
<span className="font-['Manrope'] font-bold text-[10px] tracking-widest uppercase mt-1">GEAR</span>
</a>
</nav>

    </div>
  );
}
