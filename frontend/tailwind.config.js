/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'article-cross-fade-1': {
          '0%, 100%': { 
            opacity: '1',
            transform: 'rotate(0deg) scale(1)',
          },
          '50%': { 
            opacity: '0',
            transform: 'rotate(180deg) scale(1.1)',
          },
        },
        'article-cross-fade-2': {
          '0%, 100%': { 
            opacity: '0',
            transform: 'rotate(180deg) scale(1.1)',
          },
          '50%': { 
            opacity: '1',
            transform: 'rotate(360deg) scale(1)',
          },
        },
      },
      animation: {
        'article-cross-fade-1': 'article-cross-fade-1 6s ease-in-out infinite',
        'article-cross-fade-2': 'article-cross-fade-2 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
