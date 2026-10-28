import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  Children,
  isValidElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export function Popup({
  anchor,
  onClose,
  children,
  role = "menu",
  label,
  width = 264,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  role?: "menu" | "listbox";
  label: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) {
        close.current();
        return;
      }
      const r = anchor.getBoundingClientRect(),
        el = ref.current!;
      const w = el.offsetWidth,
        h = el.offsetHeight;
      const below = innerHeight - r.bottom - 12,
        above = r.top - 12;
      const top = below >= h || below >= above ? r.bottom + 6 : r.top - h - 6;
      setPosition({
        left: Math.max(8, Math.min(r.right - w, innerWidth - w - 8)),
        top: Math.max(8, Math.min(top, innerHeight - h - 8)),
        ready: true,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    const scroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      close.current();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchor]);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(
      "button:not(:disabled)",
    );
    first?.focus({ preventScroll: true });
    const outside = (e: Event) => {
      const n = e.target as Node;
      if (!ref.current?.contains(n) && !anchor.contains(n)) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        anchor.focus();
      }
      if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        ref.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        const items = Array.from(
          ref.current.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, position.ready]);
  return createPortal(
    <div
      ref={ref}
      className="floating-menu"
      role={role}
      aria-label={label}
      style={{
        width,
        maxWidth: "calc(100vw - 16px)",
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
export function Select({
  children,
  value,
  onChange,
  disabled,
  "aria-label": label,
  className,
  id,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{
      value?: string;
      disabled?: boolean;
      children?: ReactNode;
    }>(child) && child.type === "option"
      ? [
          {
            value: String(child.props.value ?? ""),
            disabled: child.props.disabled,
            label: child.props.children,
          },
        ]
      : [],
  );
  const selected = options.find((o) => o.value === String(value));
  const trigger = useRef<HTMLButtonElement>(null);
  const [parentLabel, setParentLabel] = useState("");
  useEffect(() => {
    const parent = trigger.current?.closest("label");
    if (parent)
      setParentLabel(
        Array.from(parent.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join("")
          .trim(),
      );
  }, []);
  const choose = (v: string) => {
    onChange?.({
      target: { value: v },
      currentTarget: { value: v },
    } as ChangeEvent<HTMLSelectElement>);
    setAnchor(null);
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        className={`custom-select ${className || ""}`}
        aria-label={label || parentLabel || rest.title || "Select option"}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setAnchor(e.currentTarget);
          }
        }}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={15} />
      </button>
      {anchor && (
        <Popup
          anchor={anchor}
          onClose={() => setAnchor(null)}
          role="listbox"
          label={label || parentLabel || "Options"}
          width={Math.max(200, anchor.offsetWidth)}
        >
          {options.map((o) => (
            <button
              type="button"
              role="option"
              aria-selected={o.value === String(value)}
              disabled={o.disabled}
              key={o.value}
              onClick={() => choose(o.value)}
            >
              <span>{o.label}</span>
              {o.value === String(value) && <Check size={16} />}
            </button>
          ))}
        </Popup>
      )}
    </>
  );
}
