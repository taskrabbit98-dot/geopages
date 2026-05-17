/// <reference types="vite/client" />

// CSS module with Vite ?url query
declare module "*.css?url" {
  const url: string;
  export default url;
}
