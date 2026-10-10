import { useLayoutEffect, useRef, type RefObject } from 'react';

/** FLIP only the empty/populated boundary; streaming updates never move the workspace. */
export function useWorkspaceTransition(root: RefObject<HTMLDivElement | null>, populated: boolean, ready: boolean, formRevision: number) {
  const previous = useRef<{ populated: boolean; ready: boolean; box: DOMRect; headerHeight: number } | undefined>(undefined);
  const animations = useRef<Animation[]>([]);
  const cancel = () => { animations.current.forEach(animation => animation.cancel()); animations.current = []; };

  useLayoutEffect(() => {
    const workspace = root.current;
    const card = workspace?.querySelector<HTMLElement>('.ui-downloader');
    const header = card?.querySelector<HTMLElement>('.ui-pane-header');
    const queue = workspace?.querySelector<HTMLElement>('.ui-downloads-column');
    if (!workspace || !card || !header || !queue) return;
    const old = previous.current;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    const oldHeight = animations.current.length ? header.getBoundingClientRect().height : old?.headerHeight;
    const welcome = header.querySelector<HTMLElement>('.ui-welcome')!;
    const label = header.querySelector<HTMLElement>('.ui-heading-label')!;
    const interrupted = animations.current.length > 0;
    const queueOpacity = interrupted ? getComputedStyle(queue).opacity : old?.populated ? '1' : '0';
    const queueTransform = interrupted ? getComputedStyle(queue).transform : undefined;
    const welcomeOpacity = interrupted ? getComputedStyle(welcome).opacity : populated ? '1' : '0';
    const labelOpacity = interrupted ? getComputedStyle(label).opacity : populated ? '0' : '1';
    cancel();
    const box = card.getBoundingClientRect();
    const headerHeight = header.getBoundingClientRect().height;
    previous.current = { populated, ready, box, headerHeight };
    if (!old?.ready || old.populated === populated || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const options: KeyframeAnimationOptions = { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    const animate = (element: HTMLElement, frames: Keyframe[]) => {
      const animation = element.animate(frames, options);
      animations.current.push(animation);
      return animation;
    };
    // Mobile switches panels through tabs, so only the visible panel fades there.
    const desktop = matchMedia('(min-width: 700px)').matches;
    if (desktop) {
      animate(header, [{ height: `${oldHeight}px` }, { height: `${headerHeight}px` }]);
      // In the centered layout, animating the header also changes the card's top.
      // Measure the starting height before calculating the positional inversion.
      const startBox = card.getBoundingClientRect();
      animate(card, [
        { transform: `translate(${old.box.left + matrix.e - startBox.left}px, ${old.box.top + matrix.f - startBox.top}px)` },
        { transform: 'translate(0, 0)' },
      ]);
    }
    animate(welcome, [{ opacity: welcomeOpacity }, { opacity: populated ? 0 : 1 }]);
    animate(label, [{ opacity: labelOpacity }, { opacity: populated ? 1 : 0 }]);
    const last = animate(queue, [
      { opacity: queueOpacity, transform: queueTransform ?? (desktop && populated ? 'translateX(16px)' : 'translateX(0)'), visibility: 'visible' },
      { opacity: populated ? 1 : 0, transform: desktop && !populated ? 'translateX(16px)' : 'translateX(0)', visibility: 'visible' },
    ]);
    last.onfinish = () => {
      cancel();
      previous.current = { populated, ready, box: card.getBoundingClientRect(), headerHeight: header.getBoundingClientRect().height };
    };
  }, [root, populated, ready, formRevision]);

  useLayoutEffect(() => {
    const workspace = root.current;
    const card = workspace?.querySelector<HTMLElement>('.ui-downloader');
    const header = card?.querySelector<HTMLElement>('.ui-pane-header');
    if (!workspace || !card || !header) return;
    const record = () => {
      if (previous.current && !animations.current.length) {
        previous.current.box = card.getBoundingClientRect();
        previous.current.headerHeight = header.getBoundingClientRect().height;
      }
    };
    const reset = () => { cancel(); record(); };
    const observer = new ResizeObserver(record);
    observer.observe(workspace);
    observer.observe(card);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    reduced.addEventListener('change', reset);
    window.addEventListener('resize', reset);
    return () => {
      cancel(); observer.disconnect();
      reduced.removeEventListener('change', reset);
      window.removeEventListener('resize', reset);
    };
  }, [root, formRevision]);
}
