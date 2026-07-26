/**
 * 共用線條圖示（取代 emoji，統一 1.75 stroke 視覺）
 */

import type { SVGProps } from 'react';

function Ic({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[15px] h-[15px] flex-none"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconLogo = (p: SVGProps<SVGSVGElement>) => (
  <Ic strokeWidth={2} {...p}><path d="M3 17l5-6 4 4 6-8" /><path d="M15 7h3v3" /></Ic>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M12 5v14M5 12h14" /></Ic>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></Ic>
);
export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></Ic>
);
export const IconDots = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Ic>
);
export const IconEdit = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M17 3l4 4L8 20l-5 1 1-5z" /></Ic>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" /></Ic>
);
export const IconChartLink = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M7 17l4-6 3 3 4-7" /><path d="M14 21h7v-7" /></Ic>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M20 6L9 17l-5-5" /></Ic>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M6 6l12 12M18 6L6 18" /></Ic>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Ic>
);
export const IconBars = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M4 20V10M10 20V4M16 20v-9M22 20H2" /></Ic>
);
export const IconWallet = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></Ic>
);
export const IconDice = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ic>
);
export const IconList = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconArrowUp = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M12 19V5m-6 6l6-6 6 6" /></Ic>
);
export const IconArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M12 5v14m-6-6l6 6 6-6" /></Ic>
);
export const IconRecalc = (p: SVGProps<SVGSVGElement>) => (
  <Ic {...p}><path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" /><path d="M18 3v4h-4M6 21v-4h4" /></Ic>
);

export function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 flex-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
