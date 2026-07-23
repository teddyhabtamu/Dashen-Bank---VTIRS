import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { VehicleForm } from "@/components/vehicle-form";

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/vehicles" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600">
        <ArrowLeft className="h-3.5 w-3.5" />
        Vehicles
      </Link>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Edit Vehicle</h2>
        <p className="mt-1 text-sm text-slate-500">Update the vehicle master record.</p>
      </div>
      <VehicleForm vehicleId={id} />
    </div>
  );
}
