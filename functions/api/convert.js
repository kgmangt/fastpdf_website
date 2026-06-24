
export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();

    const response = await fetch(
      "https://gotenberg-production-114c.up.railway.app/forms/libreoffice/convert",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      return new Response(
        await response.text(),
        { status: response.status }
      );
    }

    const pdfBuffer = await response.arrayBuffer();

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="converted.pdf"',
      },
    });
  } catch (err) {
    return new Response(
      "Conversion failed: " + err.message,
      { status: 500 }
    );
  }
}
