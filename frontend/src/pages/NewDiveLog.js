import React from 'react';
import { useNavigate } from 'react-router-dom';


export default function NewDiveLog() {
  const navigate = useNavigate();
  return (
    <div className="bg-dp-background text-dp-on-background font-body selection:bg-dp-secondary selection:text-dp-on-secondary min-h-screen">
      
<header className="bg-[#0e0e0e]/60 backdrop-blur-md fixed top-0 z-50 border-b-4 border-[#20201f] shadow-[0_10px_40px_rgba(182,160,255,0.08)] flex items-center justify-between px-6 h-20 w-full">
<div className="flex items-center gap-4">
<button className="text-[#b6a0ff] hover:scale-110 hover:text-[#ff716c] transition-transform active:scale-95 duration-100 ease-in-out">
<span className="material-symbols-outlined text-3xl">arrow_back</span>
</button>
<h1 className="font-['Space_Grotesk'] font-bold tracking-tight uppercase text-[#b6a0ff] text-xl">ALL CAPTURES</h1>
</div>
<div className="flex items-center">
<span className="text-2xl font-black text-[#b6a0ff] italic">DEEP_LOG</span>
</div>
</header>
<main className="pt-28 pb-32 px-6 relative overflow-hidden">
{/* Background Decorative Elements */}
<div className="absolute top-40 -left-20 w-64 h-64 bg-dp-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
<div className="absolute bottom-20 -right-20 w-80 h-80 bg-dp-secondary/10 rounded-full blur-[100px] pointer-events-none"></div>
{/* Header Stats */}
<div className="mb-12 flex flex-wrap gap-4 items-end">
<div className="bg-dp-surface-container-high p-6 border-4 border-dp-outline rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
<p className="font-headline text-dp-secondary text-sm font-bold uppercase tracking-widest mb-1">Total Memories</p>
<p className="font-headline text-4xl font-black text-dp-on-background">124 <span className="text-dp-primary text-xl tracking-tighter italic">SHOTS</span></p>
</div>
<div className="bg-dp-tertiary-container p-4 border-4 border-dp-on-background rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
<span className="font-headline font-black text-dp-on-tertiary-container text-lg">PRO DIVER MODE</span>
</div>
</div>
{/* Bento Photo Grid */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
{/* Sticker Card 1 */}
<div className="group relative">
<div className="bg-white p-4 pb-12 shadow-[12px_12px_0px_0px_#b6a0ff] border-4 border-dp-surface-container-highest">
<div className="aspect-square bg-dp-surface-container-low overflow-hidden border-2 border-dp-surface-container-highest">
<img alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt="Close up of a vibrant sea turtle underwater" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-yh9PCAVc0gUl8id3tkS-L3wYoHXOWbFfoI3aqBKzc85XNwArsYtMqgZf6xb3TUccCt4mPoEfywjMYhyL6b0O8BgJSNvxrQvobq_aEScR8G2YYZKPcM9At-PAeGB-c4eZ-M2O7gKCPwbX8CzgjqeeML4hK2l_Za04TndsU86AH7pAAWM3YMH0Y77V78HeknwKPdYOb-TD-nu86ewKUPyoMfq-9HOa6gPLU6fpVjlM4szqE73FUnVA2fvBC3Txh_3DEQffH1ScNUwv"/>
</div>
<div className="mt-6">
<p className="font-headline text-dp-surface-container-lowest text-2xl font-black tracking-tighter uppercase">Bora Bora</p>
<p className="font-body text-dp-surface-container-lowest/60 text-xs font-bold tracking-widest mt-1">OCT 12 • 18M DEPTH</p>
</div>
</div>
{/* Overlap Sticker */}
<div className="absolute -top-4 -right-4 bg-dp-secondary p-2 border-4 border-dp-on-background rounded-full rotate-[15deg] shadow-lg">
<span className="material-symbols-outlined text-dp-on-secondary-container" style={{fontVariationSettings: "'FILL' 1"}}>water_drop</span>
</div>
</div>
{/* Sticker Card 2 */}
<div className="group relative">
<div className="bg-white p-4 pb-12 shadow-[12px_12px_0px_0px_#00e3fd] border-4 border-dp-surface-container-highest">
<div className="aspect-square bg-dp-surface-container-low overflow-hidden border-2 border-dp-surface-container-highest">
<img alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt="Sunlight piercing through deep blue ocean water hole" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAeJiziulkpnkPNcApWJ41JDHEfvPLL9nipNluREqd-dkTnVBypCI0QoU6z-hHEuroqgwhnmTDRiWeofSmmKcW-fRqeIoKpK85or4A-E6ZLNCRxLkr1iecaTu4fi_1koOIWXZRzKp5gYfXnaJVPUfodQi2BG2BU0AcqVt20vdQVqGrUPXTtaw8F9GVxzrt0o2--D5Sn_4xhcVALtOU_MrgWP6sAK76JKJfthlc10bFHW5SIyAA3qgoWP5KtTSh30eyt9oZJkAyDRG0A"/>
</div>
<div className="mt-6">
<p className="font-headline text-dp-surface-container-lowest text-2xl font-black tracking-tighter uppercase">Great Blue Hole</p>
<p className="font-body text-dp-surface-container-lowest/60 text-xs font-bold tracking-widest mt-1">SEP 05 • 40M DEPTH</p>
</div>
</div>
{/* Overlap Sticker */}
<div className="absolute -bottom-4 -left-4 bg-dp-tertiary p-3 border-4 border-dp-on-background rotate-[-10deg] shadow-lg">
<p className="font-headline font-black text-dp-on-tertiary text-xs">NEW DEPTH PB</p>
</div>
</div>
{/* Sticker Card 3 */}
<div className="group relative">
<div className="bg-white p-4 pb-12 shadow-[12px_12px_0px_0px_#ff716c] border-4 border-dp-surface-container-highest">
<div className="aspect-square bg-dp-surface-container-low overflow-hidden border-2 border-dp-surface-container-highest">
<img alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt="Diver swimming through tall golden kelp forest" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC6h62tjd9XUC30ZZGUGKTU47W04nIGeowGFQLsN-6_C4IEBeB-pn_ZGlX6kBlR1WXXlV87nYQm3BJzK1ozjPfBVavpI0UwuxR38Qe9a3vDJ4tcMadmndbm9dJho7of_bxt-Uk7Qy0L4DU5Hj5rgNuOlFG_JnwcmuyAOiBGQTo7Tp5KxFdrfJv7OQtqUDu3-XKsiZY7P3uJhNsM2qGTmQ11sc2ePsd-4KKwjvvvwzA8m3I2MeQL2FzBZaZOrerh5j3yBmR8NeKMFDWV"/>
</div>
<div className="mt-6">
<p className="font-headline text-dp-surface-container-lowest text-2xl font-black tracking-tighter uppercase">Monterey Kelp</p>
<p className="font-body text-dp-surface-container-lowest/60 text-xs font-bold tracking-widest mt-1">AUG 22 • 12M DEPTH</p>
</div>
</div>
</div>
{/* Sticker Card 4 */}
<div className="group relative">
<div className="bg-white p-4 pb-12 shadow-[12px_12px_0px_0px_#b6a0ff] border-4 border-dp-surface-container-highest">
<div className="aspect-square bg-dp-surface-container-low overflow-hidden border-2 border-dp-surface-container-highest">
<img alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt="Colorful coral reef teeming with small tropical fish" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAQQKXyFnbtVDeCH24d7DJz0qgr0J266jbCH9QAl2tE1KWLfOmcGvwNdXUxiIYkIumELDNIzV_Z3J7omlkIs_sjWAEpPo4IzKIsABrrbNE0XJ6PWo0dLtEDl4d6XgWJ-30BuK7LkoVDT0bee2nsVStYWndv3pUMLNv0LbTK4RmDfKBWiDaGMDznz3zNsDizR62Z52UVyYaHzBojXnZQFEsgMzf0XXj94b-s12-7ypguqu_zdSMIbzkVW8j-zdYCvlUugVbtrEyErgVz"/>
</div>
<div className="mt-6">
<p className="font-headline text-dp-surface-container-lowest text-2xl font-black tracking-tighter uppercase">Raja Ampat</p>
<p className="font-body text-dp-surface-container-lowest/60 text-xs font-bold tracking-widest mt-1">JUL 15 • 28M DEPTH</p>
<div className="mt-4 flex flex-wrap gap-2">
<span className="px-2 py-1 bg-dp-secondary text-dp-on-secondary text-[10px] font-black rounded border-2 border-dp-surface-container-lowest">BIODIVERSITY</span>
<span className="px-2 py-1 bg-dp-primary text-dp-on-primary text-[10px] font-black rounded border-2 border-dp-surface-container-lowest">HD CAPTURE</span>
</div>
</div>
</div>
</div>
{/* Sticker Card 5 */}
<div className="group relative">
<div className="bg-white p-4 pb-12 shadow-[12px_12px_0px_0px_#00e3fd] border-4 border-dp-surface-container-highest">
<div className="aspect-square bg-dp-surface-container-low overflow-hidden border-2 border-dp-surface-container-highest">
<img alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt="Majestic manta ray gliding through deep ocean" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDDBnYn2SMgyTcnBBFFQkhObOWfm9xkZwwpdaye869d2gXi4X3gy3BLjr2Pth65WC6ztWaXefxcBo5LmyJ4WKtSY7KAFSYEI2Y_OTUYBEQ2Z3d4p6SGZZB2bpiI0Sx4JA3XZ_Kxa5nB9bGltVrcTRQ0H90NMjRJDsnMKZse0XhCRYDYTKUNXJnm6vhIRVDkw_WpujD_qxIX3UbA9WtXIOfe_3REhq3Nn8LeoJLmItaOlDjLqQzrAArmxxgJQeEndzVdF-Tmx98Uxr2X"/>
</div>
<div className="mt-6">
<p className="font-headline text-dp-surface-container-lowest text-2xl font-black tracking-tighter uppercase">Manta Point</p>
<p className="font-body text-dp-surface-container-lowest/60 text-xs font-bold tracking-widest mt-1">JUL 30 • 22M DEPTH</p>
</div>
</div>
<div className="absolute top-1/2 -right-6 -translate-y-1/2 bg-dp-on-background p-4 border-4 border-dp-primary rounded-xl rotate-[90deg] shadow-lg">
<p className="font-headline font-black text-dp-primary text-xs tracking-[0.2em]">SIGHTING: RARE</p>
</div>
</div>
</div>
{/* Pagination / Load More Sticker */}
<div className="mt-20 flex justify-center">
<button className="group relative">
<div className="bg-dp-secondary p-6 px-12 border-4 border-dp-on-background rounded-[2rem] shadow-[8px_8px_0px_0px_#b6a0ff] flex items-center gap-4">
<span className="font-headline font-black text-dp-on-secondary text-2xl uppercase tracking-tighter">See Older Logs</span>
<span className="material-symbols-outlined text-dp-on-secondary font-black">arrow_downward</span>
</div>
</button>
</div>
</main>
{/* BottomNavBar */}
<nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-4 bg-[#131313] border-t-4 border-[#767575] rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(126,81,255,0.15)]">
{/* LOGS (Active) */}
<a className="flex flex-col items-center justify-center bg-[#ff716c] text-[#ffffff] rounded-xl border-2 border-white rotate-[2deg] scale-110 px-4 py-2 animate-[spring_0.3s_cubic-bezier(0.34,1.56,0.64,1)]" href="#">
<span className="material-symbols-outlined text-2xl">waves</span>
<span className="font-['Manrope'] font-extrabold text-[10px] uppercase tracking-tighter mt-1">LOGS</span>
</a>
{/* DEPTH */}
<a className="flex flex-col items-center justify-center text-[#767575] px-4 py-2 hover:text-[#b6a0ff] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">sailing</span>
<span className="font-['Manrope'] font-extrabold text-[10px] uppercase tracking-tighter mt-1">DEPTH</span>
</a>
{/* GEAR */}
<a className="flex flex-col items-center justify-center text-[#767575] px-4 py-2 hover:text-[#b6a0ff] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">socks</span>
<span className="font-['Manrope'] font-extrabold text-[10px] uppercase tracking-tighter mt-1">GEAR</span>
</a>
{/* CHART */}
<a className="flex flex-col items-center justify-center text-[#767575] px-4 py-2 hover:text-[#b6a0ff] transition-colors" href="#">
<span className="material-symbols-outlined text-2xl">explore</span>
<span className="font-['Manrope'] font-extrabold text-[10px] uppercase tracking-tighter mt-1">CHART</span>
</a>
</nav>
{/* Background Noise Overlay */}
<div className="fixed inset-0 pointer-events-none bg-noise"></div>

    </div>
  );
}









