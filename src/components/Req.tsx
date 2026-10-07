/** The red * after a required field's label. Screen readers already hear "required" from the field itself. */
export function Req() {
  return (
    <span aria-hidden className="ml-0.5 text-danger">
      *
    </span>
  );
}
