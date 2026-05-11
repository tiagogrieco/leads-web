/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                primary: { DEFAULT: "#B08D7E", light: "#D4B5A0", dark: "#8B6F60" },
                accent: { DEFAULT: "#D4A88A" },
                bg: { DEFAULT: "#FAF8F5" },
                ink: { DEFAULT: "#2D2A26" },
            },
        },
    },
    plugins: [],
};
