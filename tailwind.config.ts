import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 重新對應 gray 色階為藍調中性色：讓仍使用 gray-* 的元件（DataModal 等）自動跟上新視覺
        gray: {
          50: '#F4F6FA',
          100: '#E9EDF5',
          200: '#D4DAE6',
          300: '#B9C2D4',
          400: '#9AA5BA',
          500: '#67728C',
          600: '#33405A',
          700: '#232C3D',
          800: '#1A2130',
          900: '#121722',
          950: '#0B0E14',
        },
        // ===== 設計 tokens（深色交易終端）=====
        bg: '#0B0E14',
        surface: '#121722',
        raised: '#1A2130',
        overlay: '#1E2636',
        line: {
          DEFAULT: '#232C3D',
          soft: '#1B2332',
          strong: '#33405A',
        },
        ink: {
          DEFAULT: '#E9EDF5',
          2: '#9AA5BA',
          3: '#67728C',
        },
        accent: {
          DEFAULT: '#5B8DEF',
          hover: '#6C9AF3',
          soft: 'rgba(91,141,239,.14)',
          edge: 'rgba(91,141,239,.38)',
        },
        // 台股慣例：漲紅跌綠
        up: {
          DEFAULT: '#F16D6D',
          soft: 'rgba(241,109,109,.13)',
          edge: 'rgba(241,109,109,.3)',
        },
        down: {
          DEFAULT: '#45D48A',
          soft: 'rgba(69,212,138,.12)',
          edge: 'rgba(69,212,138,.28)',
        },
        warn: {
          DEFAULT: '#E8B44C',
          soft: 'rgba(232,180,76,.13)',
          edge: 'rgba(232,180,76,.3)',
        },
        // 自定義顏色（可根據設計需求調整）
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          700: '#15803d',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          700: '#b91c1c',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          700: '#b45309',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans TC',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;

