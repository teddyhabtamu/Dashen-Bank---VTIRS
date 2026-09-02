import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { VehicleForm } from "@/components/vehicle-form";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { PERMISSIONS } from "@/lib/rbac";

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error || "Failed to delete");
        return;
      }
      toast("success", "Vehicle deleted");
      navigate("/vehicles");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-3.5 w-3.5" />
          Vehicles
        </Link>
        {id && can(PERMISSIONS.VEHICLE_DELETE) && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Vehicle
          </button>
        )}
      </div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Edit Vehicle</h2>
        <p className="mt-1 text-sm text-slate-500">Update the vehicle master record.</p>
      </div>
      <VehicleForm vehicleId={id} returnTo={id ? `/vehicles/${id}` : "/vehicles"} />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete Vehicle"
        message="The vehicle will be removed permanently. Vehicles with active registrations, insurance policies, or driver assignments cannot be deleted — resolve those first."
        confirmLabel="Delete"
      />
    </div>
  );
}
