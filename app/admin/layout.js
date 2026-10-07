// 'use client';
// import { useEffect, useState } from 'react';
// import Sidebar from '@/components/Sidebar';
// import Topbar from '@/components/Topbar';
// import ChatBot, { ChatBotProvider } from '@/components/ChatBot';
// import { ScopeProvider } from '@/components/ScopeContext';
// import { disableSelectScroll } from '@/lib/disableSelectScroll';

// export default function AdminLayout({ children }) {
//   const [collapsed, setCollapsed] = useState(false);

//   /* Every <select> in every module - purchase, sales, inventory, contacts,
//      transportation, logistics, masters - mounts somewhere under here, so one
//      listener at this root covers all of them without touching a single form
//      file. See lib/disableSelectScroll.js. */
//   useEffect(() => disableSelectScroll(), []);

//   return (
//     <ScopeProvider>
//      <ChatBotProvider>
//       <div className="flex min-h-screen">
//         <Sidebar collapsed={collapsed} />
//         <div className={'min-w-0 flex-1 ' + (collapsed ? 'ml-0' : 'ml-sidebar')}>
//           <Topbar onToggleSidebar={() => setCollapsed((c) => !c)} />
//           <main className="px-5 pb-14 pt-4">{children}</main>
//         </div>
//       </div>

//       {/* Signed-in screens only - deliberately not in the root layout, so it
//           stays off the marketing landing page and /login. Mounted here rather
//           than per-page so its transcript survives navigation between screens. */}
//       <ChatBot />
//      </ChatBotProvider>
//     </ScopeProvider>
//   );
// }


'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import ChatBot, { ChatBotProvider } from '@/components/ChatBot';
import { ScopeProvider } from '@/components/ScopeContext';
import { disableSelectScroll } from '@/lib/disableSelectScroll';

export default function AdminLayout({ children }) {
  /* Two separate states, because the panel behaves differently at the two
     sizes: on a wide screen it collapses in place to an icon rail, and on a
     narrow one it slides in over the page as a drawer. Keeping them apart is
     what lets the markup render the same on the server at either size. */
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  /* Picking a screen on mobile should get you to it, not leave the drawer
     sitting over the top of it. */
  useEffect(() => setMobileOpen(false), [pathname]);

  /* Every <select> in every module - purchase, sales, inventory, contacts,
     transportation, logistics, masters - mounts somewhere under here, so one
     listener at this root covers all of them without touching a single form
     file. See lib/disableSelectScroll.js. */
  useEffect(() => disableSelectScroll(), []);

  return (
    <ScopeProvider>
     <ChatBotProvider>
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* Mobile only: dims the page behind the drawer and dismisses it. */}
        {mobileOpen && (
          <div
            role="presentation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-black/45 lg:hidden"
          />
        )}

        {/* Matches the rail's own width transition, so the two move together
            rather than the content snapping ahead of the panel. */}
        <div
          className={
            'ml-0 min-w-0 flex-1 transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ' +
            (collapsed ? 'lg:ml-sidebarmini' : 'lg:ml-sidebar')
          }
        >
          <Topbar onToggleSidebar={() => setMobileOpen((o) => !o)} />
          <main className="px-3 pb-6 pt-4 sm:px-5">{children}</main>
        </div>
      </div>

      {/* Signed-in screens only - deliberately not in the root layout, so it
          stays off the marketing landing page and /login. Mounted here rather
          than per-page so its transcript survives navigation between screens. */}
      <ChatBot />
     </ChatBotProvider>
    </ScopeProvider>
  );
}
