import { useParams } from "react-router-dom";
import { VehicleForm } from "@/components/vehicle-form";

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Edit Vehicle</h2>
        <p className="text-sm text-slate-500">Update the vehicle master record.</p>
      </div>
      <VehicleForm vehicleId={id} />
    </div>
  );
}
