import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconChevronUp } from './DriveIcons';

export function SettingsSelect({
  value,
  onChange,
  options = [],
  className = '',
  triggerClassName = '',
  menuClassName = '',
  size = 'default',
  menuAlign = 'left',
  menuPlacement = 'bottom',
  disabled = false,
  ariaLabel,
  style,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  const sizeClass =
    size === 'sm'
      ? 'gd-settings-select--sm'
      : size === 'xs'
      ? 'gd-settings-select--xs'
      : '';

  const alignClass = menuAlign === 'right' ? 'gd-settings-select-menu--right' : '';
  const placementClass = menuPlacement === 'top' ? 'gd-settings-select-menu--top' : '';

  return (
    <div
      ref={wrapRef}
      style={style}
      className={`gd-settings-select-wrap ${sizeClass} ${className}`.trim()}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        className={`gd-settings-select-trigger${open ? ' gd-settings-select-trigger--open' : ''} ${triggerClassName}`.trim()}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="gd-settings-select-trigger-label">
          {selected ? selected.label : String(value ?? '')}
        </span>
        {open ? (
          <IconChevronUp className="gd-settings-select-chevron" />
        ) : (
          <IconChevronDown className="gd-settings-select-chevron" />
        )}
      </button>
      {open && (
        <div className={`gd-settings-select-menu ${alignClass} ${placementClass} ${menuClassName}`.trim()} role="listbox">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`gd-settings-select-option${isSelected ? ' gd-settings-select-option--selected' : ''}`}
                onClick={() => pick(opt.value)}
              >
                <span className="gd-settings-select-check-slot">
                  {isSelected ? <IconCheck className="gd-settings-select-check" /> : null}
                </span>
                <span className="whitespace-nowrap">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
