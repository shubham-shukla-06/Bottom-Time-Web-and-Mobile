/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
        extend: {
                fontFamily: {
                        headline: ['Space Grotesk', 'sans-serif'],
                        body: ['Manrope', 'sans-serif'],
                        label: ['Manrope', 'sans-serif'],
                        sans: ['"Outfit"', 'sans-serif'],
                        heading: ['"Outfit"', 'sans-serif'],
                },
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)'
                },
                colors: {
                        'dp-tertiary-container': '#f94d4e',
                        'dp-tertiary-fixed-dim': '#ff7b75',
                        'dp-inverse-primary': '#6834eb',
                        'dp-on-secondary': '#004d57',
                        'dp-surface': '#0e0e0e',
                        'dp-surface-bright': '#2c2c2c',
                        'dp-outline': '#767575',
                        'dp-surface-dim': '#0e0e0e',
                        'dp-primary-container': '#a98fff',
                        'dp-primary-fixed': '#a98fff',
                        'dp-on-tertiary': '#490006',
                        'dp-on-surface-variant': '#adaaaa',
                        'dp-tertiary': '#ff716c',
                        'dp-secondary': '#00e3fd',
                        'dp-on-secondary-fixed': '#003a42',
                        'dp-primary': '#b6a0ff',
                        'dp-on-error': '#490013',
                        'dp-primary-fixed-dim': '#9c7eff',
                        'dp-surface-container': '#1a1a1a',
                        'dp-inverse-on-surface': '#565555',
                        'dp-secondary-fixed': '#26e6ff',
                        'dp-on-tertiary-fixed': '#3a0004',
                        'dp-secondary-fixed-dim': '#00d7f0',
                        'dp-on-tertiary-container': '#110000',
                        'dp-tertiary-dim': '#ff716c',
                        'dp-tertiary-fixed': '#ff928c',
                        'dp-on-tertiary-fixed-variant': '#790010',
                        'dp-outline-variant': '#484847',
                        'dp-surface-variant': '#262626',
                        'dp-primary-dim': '#7e51ff',
                        'dp-error-container': '#a70138',
                        'dp-on-primary-fixed-variant': '#32008a',
                        'dp-surface-container-high': '#20201f',
                        'dp-secondary-dim': '#00d4ec',
                        'dp-error-dim': '#d73357',
                        'dp-on-secondary-container': '#e8fbff',
                        'dp-surface-container-highest': '#262626',
                        'dp-on-primary-container': '#280072',
                        'dp-on-background': '#ffffff',
                        'dp-background': '#0e0e0e',
                        'dp-error': '#ff6e84',
                        'dp-inverse-surface': '#fcf9f8',
                        'dp-secondary-container': '#006875',
                        'dp-on-surface': '#ffffff',
                        'dp-on-primary': '#340090',
                        'dp-surface-container-low': '#131313',
                        'dp-on-error-container': '#ffb2b9',
                        'dp-surface-container-lowest': '#000000',
                        'dp-on-secondary-fixed-variant': '#005964',
                        'dp-surface-tint': '#b6a0ff',
                        'dp-on-primary-fixed': '#000000',
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        }
                },
                keyframes: {
                        'accordion-down': {
                                from: {
                                        height: '0'
                                },
                                to: {
                                        height: 'var(--radix-accordion-content-height)'
                                }
                        },
                        'accordion-up': {
                                from: {
                                        height: 'var(--radix-accordion-content-height)'
                                },
                                to: {
                                        height: '0'
                                }
                        },
                        shimmer: {
                                '0%': {
                                        transform: 'translateX(-100%)'
                                },
                                '100%': {
                                        transform: 'translateX(100%)'
                                }
                        }
                },
                animation: {
                        'accordion-down': 'accordion-down 0.2s ease-out',
                        'accordion-up': 'accordion-up 0.2s ease-out',
                        shimmer: 'shimmer 1.5s infinite'
                }
        }
  },
  plugins: [require("tailwindcss-animate")],
};
