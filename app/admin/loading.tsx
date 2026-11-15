// Shown at once when a panel option is tapped, while the server prepares the data.
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="skeleton h-8 w-48 rounded-lg" />
      <div className="skeleton h-4 w-72 max-w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        <div className="skeleton h-24 rounded-[20px]" />
        <div className="skeleton h-24 rounded-[20px]" />
        <div className="skeleton h-24 rounded-[20px]" />
      </div>
      <div className="skeleton h-48 rounded-[20px]" />
      <div className="skeleton h-14 rounded-2xl" />
      <div className="skeleton h-14 rounded-2xl" />
    </div>
  )
}
