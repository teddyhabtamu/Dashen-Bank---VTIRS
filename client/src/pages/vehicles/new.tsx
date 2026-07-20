import { VehicleForm } from "@/components/vehicle-form";

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Register New Vehicle</h2>
        <p className="text-sm text-slate-500">
          Complete all sections to create a vehicle master record.
        </p>
      </div>
      <VehicleForm />
    </div>
  );
}
