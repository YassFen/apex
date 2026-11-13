import { Logo } from '@/components/ui/Logo'
import { AUTH_PHOTO } from '@/lib/constants/photos'

// Photo on top (phones) or as the backdrop (desktop), with the form on a sheet-like card.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh bg-bg flex flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="relative h-[30dvh] sm:absolute sm:inset-0 sm:h-auto overflow-hidden" aria-hidden>
        <img src={AUTH_PHOTO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.35),rgb(0_0_0/0.15)_40%,rgb(var(--c-bg))_100%)] sm:bg-black/55" />
        <a href="/welcome" className="absolute top-[calc(16px+env(safe-area-inset-top))] left-5 text-white pointer-events-auto" aria-label="APEX"><Logo size={26} markClassName="text-white" /></a>
      </div>
      <div className="relative -mt-8 sm:mt-0 flex-1 sm:flex-none w-full sm:max-w-md bg-bg rounded-t-[32px] sm:rounded-[32px] px-5 pt-8 pb-[calc(32px+env(safe-area-inset-bottom))] sm:p-8 sm:shadow-e3">
        <div className="w-full max-w-sm mx-auto">{children}</div>
      </div>
    </main>
  )
}
