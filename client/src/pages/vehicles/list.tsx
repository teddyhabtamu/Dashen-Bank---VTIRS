import { VehicleTable } from "@/components/vehicle-table";

export default function VehiclesPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Vehicle Registry</h2>
          <p className="text-sm text-slate-500">Browse, register &amp; manage fleet vehicles</p>
        </div>
      </div>
      <VehicleTable />
    </div>
  );
}
