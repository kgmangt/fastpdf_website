export async function onRequestPost(context) {
  const formData = await context.request.formData();

  const response = await fetch(
    "https://gotenberg-production-114c.up.railway.app/forms/libreoffice/convert",
    {
      method: "POST",
      body: formData,
    }
  );

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="converted.pdf"',
    },
  });
}
