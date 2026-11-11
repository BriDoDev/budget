export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400">
        Salir
      </button>
    </form>
  );
}
