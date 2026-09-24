type OfficeGallerySnapshot = {
  officeGallery?: { photos: { imageId: string; caption: string }[] };
};

type OfficeMedia = {
  filename: string;
  alt: string;
  width: number;
  height: number;
};

// Undefined retains the original office photos; an explicitly empty gallery hides them.
export function resolveOfficeGallery(
  snapshot: OfficeGallerySnapshot,
  mediaById: (id: string) => OfficeMedia | undefined,
) {
  return snapshot.officeGallery?.photos.flatMap((photo) => {
    const media = mediaById(photo.imageId);
    return media
      ? [
          {
            src: `/media/${media.filename}`,
            alt: media.alt || photo.caption,
            width: media.width,
            height: media.height,
            caption: photo.caption,
          },
        ]
      : [];
  });
}
