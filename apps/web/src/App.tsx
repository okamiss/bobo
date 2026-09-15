import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import { Status } from "./shared";
const Public = lazy(() => import("./Public"));
const Admin = lazy(() => import("./Admin"));
export default function App() {
  return (
    <Suspense fallback={<Status loading />}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Public />} />
      </Routes>
    </Suspense>
  );
}
