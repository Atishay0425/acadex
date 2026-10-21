module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Red Hat Display"', 'Arial', 'sans-serif'] },
      colors: {
        primary: { DEFAULT: 'hsl(230,54%,34%)', light: 'hsl(230,54%,84%)', dark: 'hsl(230,54%,14%)', 50: 'hsl(230,54%,96%)', 100: 'hsl(230,54%,92%)' },
        secondary: { DEFAULT: 'hsl(352,70%,37%)', light: 'hsl(352,70%,67%)', dark: 'hsl(352,70%,10%)', 50: 'hsl(352,70%,97%)', 100: 'hsl(352,70%,93%)' },
        tertiary: { DEFAULT: 'hsl(228,29%,90%)', dark: 'hsl(228,29%,70%)' },
        ink: '#333333',
        surface: '#f9f9f9',
      },
      boxShadow: { card: '0 1px 2px rgba(24,25,48,.06), 0 1px 3px rgba(24,25,48,.08)' },
    },
  },
  plugins: [],
}
