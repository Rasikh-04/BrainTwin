"""Which Z-Anatomy objects belong to each atlas detailing layer.

Single source of truth shared by the Blender exporter (`export_detailing.py`)
and any offline preview of the selection, so what gets reviewed is exactly what
gets exported.

Selection is deliberately two-gated:

  1. A name pattern, because Z-Anatomy object names are real anatomical terms.
     This is what makes the choice reviewable — a neurologist can read the
     matched list and say whether it is the cerebral vasculature or not.
  2. A spatial gate on the intracranial box, because names alone let systemic
     structures through. The anterior spinal artery and the vagus nerve are
     both correctly named and both run the length of the body; without a
     spatial gate the "cerebral arteries" layer would ship a torso.

Neither gate is sufficient alone, which is why both are applied.
"""

import re

# --- Z-Anatomy source frame ------------------------------------------------
# The models are a whole standing body in metres: +X left, +Y posterior,
# +Z superior. The cranial cavity sits at the top of that body.
#
# The clip box below is the cranial cavity, measured from Z-Anatomy's own
# structures rather than guessed:
#
#   medulla oblongata   z 1.539 .. 1.579   -> foramen magnum at z ~= 1.539
#   cerebral hemisphere z 1.587 .. 1.696, x +/-0.069, y -0.078 .. +0.097
#   superior sagittal sinus              z .. 1.701  (vertex)
#   sigmoid sinus                        x .. 0.061  (widest intracranial point)
#
# Geometry is clipped to this box rather than whole objects being dropped,
# because the structures that leave the skull are exactly the ones worth
# keeping: the internal carotid (z from 1.486) and the vertebral artery
# (z from 1.420) matter at their intracranial segment, and cranial nerves
# VII, IX and XII matter at their brainstem origin. Clipping keeps the
# intracranial course of each and discards the face, scalp and neck.
# The floor sits at z 1.558 rather than at the foramen magnum itself. Lower
# than that and the internal carotid and vertebral arteries trail 40 mm of bare
# neck below a brain that stops at z -64 in atlas millimetres, which reads as
# broken geometry rather than as inflow. Here they end about 20 mm below the
# brainstem: enough to show where the blood comes from, short enough to stay
# attached to the picture.
VESSEL_CLIP = ((-0.078, -0.090, 1.558), (0.078, 0.105, 1.715))

# The cranial nerves get a tighter box than the vessels. What belongs in a
# brain atlas is where each nerve attaches to the brainstem and how it runs to
# its skull-base foramen; what does not is its peripheral distribution. Left on
# the vessel box, cranial nerve VII reached y +78 mm (the parotid plexus, well
# into the cheek) and V2's meningeal branch spanned the entire box, so the layer
# read as a spray of loose threads under the brain rather than as twelve nerves.
#
# In atlas millimetres this box is roughly x +/-56, y -55 to +58, z -68 to +60.
# The floor stops level with the bottom of the brainstem rather than below it:
# lower than that and cranial nerves IX to XII carry on into the neck as threads
# with nothing around them, and the spinal root of XI (which arises from the
# cervical cord, not the brain) appears as a detached line under the model.
NERVE_CLIP = ((-0.056, -0.064, 1.572), (0.056, 0.049, 1.700))

# Default box, used for the whole-object gate and by anything that does not
# name a layer.
CLIP_MIN, CLIP_MAX = VESSEL_CLIP


# Z-Anatomy ships label leader lines as objects alongside the anatomy, suffixed
# .g (group label) and .j (join line). They are 2 to 12 vertices each and carry
# real anatomical names, so a name filter alone happily exports them as if they
# were vessels. Drop them by suffix and by size.
LABEL_SUFFIX = re.compile(r"\.[gj](\.\d+)?$", re.I)
# Label objects top out at 12 vertices. The floor sits just above that rather
# than higher, because real anatomy down here is genuinely tiny: the anterior
# communicating artery is a 23-vertex stub and is still half the circle of
# Willis.
MIN_VERTS = 16

# --- Layer definitions -----------------------------------------------------
# `include` is matched case-insensitively against the object name with the
# left/right/group suffix (.l, .r, .001) still attached, so patterns are
# written against the bare anatomical term.

ARTERY_TERMS = [
    # Inflow to the circle of Willis.
    r"internal carotid artery",
    r"vertebral artery",
    r"basilar artery",
    # The circle itself and its communicating vessels.
    r"cerebral arterial circle",
    r"anterior communicating artery",
    r"posterior communicating artery",
    # The three cerebral territories, including named segments (M1, M3, ...).
    r"anterior cerebral artery",
    r"middle cerebral artery",
    r"posterior cerebral artery",
    # Perforators and choroidal supply.
    r"anterior choroidal artery",
    r"(medial|lateral) (lenticulostriate|striate) arter",
    # Heubner's. Anchored, because a bare "recurrent artery" also matches the
    # ulnar and tibial recurrent arteries out in the limbs.
    r"recurrent artery of",
    r"(pontine|thalamoperforating) (perforating )?(branch|arter)",
    # Posterior fossa.
    r"(anterior|posterior) inferior cerebellar artery",
    r"superior cerebellar artery",
    r"labyrinthine artery",
    r"(anterior|posterior) spinal artery",
    # Named cortical branches, which is where the surface detail comes from.
    r"artery of (the )?(central|precentral|postcentral) sulcus",
    r"(pericallosal|callosomarginal) artery",
    r"branches of (pericallosal|callosomarginal) artery",
    r"(frontobasal|frontopolar|parieto-?occipital|calcarine) artery",
    r"ophthalmic artery",
    # Dural supply. Intracranial, and it draws the inner skull vault.
    r"middle meningeal artery",
]

# Vessels whose names contain an artery term above but which are extracranial.
# The superficial and deep temporal arteries are scalp and temporalis supply,
# and the angular artery is a facial-artery branch, not the MCA angular branch.
# All three sit close enough to the head to pass a spatial gate, so they have
# to be named out explicitly.
ARTERY_EXCLUDE = [
    r"superficial temporal artery",
    r"deep temporal artery",
    r"^angular artery",
    r"transverse facial",
    r"maxillary artery",
]

# NOTE ON SCOPE (medical accuracy): Z-Anatomy's cardiovascular model contains
# no cerebral veins. There is no great cerebral vein, no internal cerebral vein,
# no basal vein, and no cortical or anastomotic veins anywhere in the file --
# only the dural sinuses, the basilar plexus and the jugulars. This layer is
# therefore the dural venous sinuses and nothing more, and the UI must say so.
# Labelling it "veins" would claim a cerebral venous anatomy we do not have.
VEIN_TERMS = [
    # Dural venous sinuses.
    r"dural venous sinus",
    r"(superior|inferior) sagittal sinus",
    r"straight sinus",
    r"transverse sinus",
    r"sigmoid sinus",
    r"occipital sinus",
    r"marginal sinus",
    r"confluence of sinus",
    r"cavernous sinus",
    r"intercavernous sinus",
    r"sphenoparietal sinus",
    r"(superior|inferior) petrosal sinus",
    r"basilar (venous )?plexus",
    # Deep cerebral venous system.
    r"great cerebral vein",
    r"internal cerebral vein",
    r"basal vein",
    r"(thalamostriate|choroid|septal) vein",
    # Superficial cerebral veins.
    r"(superior|inferior|superficial middle) cerebral vein",
    r"anastomotic vein",
    r"cerebellar vein",
    # Outflow.
    r"internal jugular vein",
    r"emissary vein",
]

NERVE_TERMS = [
    # The twelve cranial nerves. Z-Anatomy carries the Roman numeral in the
    # name, which makes this list unambiguous.
    r"olfactory (nerve|bulb|tract)",
    r"optic (nerve|chiasm|tract)",
    r"oculomotor nerve",
    r"trochlear nerve",
    # The trigeminal trunk, ganglion and roots only. Its three divisions leave
    # the skull to supply the face, which is another organ's worth of geometry
    # and nothing the brain atlas is about.
    r"trigeminal (nerve|ganglion)",
    r"(motor|sensory) root of trigeminal nerve",
    r"abducens nerve",
    r"facial nerve",
    r"(vestibulocochlear|vestibular|cochlear) nerve",
    r"glossopharyngeal nerve",
    r"vagus nerve",
    r"accessory nerve",
    r"hypoglossal nerve",
    r"intermediate nerve",
]

# Structures whose names contain a layer term but which are a different kind of
# thing. Nuclei and tracts are grey and white matter, not the nerve itself, and
# they belong to the parcellation atlas rather than to a detailing overlay.
COMMON_EXCLUDE = [
    r"nucle",
    r"\bgyrus\b",
    r"\blobe\b",
    r"\bcortex\b",
    r"\barea\b",
]


def _compile(terms):
    return re.compile("|".join(f"(?:{t})" for t in terms), re.I)


LAYERS = {
    "arteries": {
        "source": "cardio",
        "include": _compile(ARTERY_TERMS),
        "exclude": _compile(COMMON_EXCLUDE + ARTERY_EXCLUDE),
        "clip": VESSEL_CLIP,
    },
    "veins": {
        "source": "cardio",
        "include": _compile(VEIN_TERMS),
        "exclude": _compile(COMMON_EXCLUDE),
        "clip": VESSEL_CLIP,
    },
    "nerves": {
        "source": "nerves",
        "include": _compile(NERVE_TERMS),
        "exclude": _compile(COMMON_EXCLUDE),
        "clip": NERVE_CLIP,
    },
}


def is_intracranial(bbox_min, bbox_max, clip=(CLIP_MIN, CLIP_MAX)):
    """True if the object's centre sits inside the cranial cavity box.

    Intersection rather than containment, because containment would drop the
    structures that matter most: the internal carotid, the vertebral artery and
    cranial nerves VII, IX and XII all begin outside the skull. The clipper
    decides how much of each survives; this gate only decides whether the object
    reaches the head at all.
    """
    lo, hi = clip
    return all(bbox_min[i] <= hi[i] and bbox_max[i] >= lo[i] for i in range(3))


def matches(name, spec):
    if LABEL_SUFFIX.search(name):
        return False
    return bool(spec["include"].search(name)) and not spec["exclude"].search(name)


def select(rows, spec):
    """Filter inspection rows (name/verts/min/max dicts) down to one layer."""
    return [
        r
        for r in rows
        if r["verts"] >= MIN_VERTS
        and matches(r["name"], spec)
        and is_intracranial(r["min"], r["max"], spec["clip"])
    ]


# --- Alignment into the atlas frame ----------------------------------------
# Z-Anatomy: metres, +X left, +Y posterior, +Z superior.
# Atlas glb:  millimetres in MNI RAS, +X right, +Y anterior, +Z superior.
#
# So the change of basis is a 180 degree rotation about Z (a proper rotation,
# not a mirror -- left stays left) together with a metres-to-millimetres scale.
#
# The scale is exactly 1000: Z-Anatomy is modelled at true anatomical size.
# Measured against the atlas, the cerebral bounding box agrees to within about
# one percent on the two axes that are directly comparable:
#
#                     Z-Anatomy      atlas (DK cortical)
#     left-right      137.8 mm       138.7 mm      0.6% apart
#     superoinferior  117.8 mm       119.2 mm      1.2% apart
#
# (The anteroposterior extent differs by more, 180.7 against 169.9 mm, because
# the two are different individuals and the DK surface stops at the pial
# boundary. It is not evidence of a scale error, since a scale error would show
# on all three axes at once.)
#
# The translation is then whatever puts the two cerebral bounding-box centres
# on top of each other.
SCALE = 1000.0
TRANSLATION = (-0.45, -6.07, -1640.01)


def to_mni(point):
    """Z-Anatomy point in metres -> atlas point in MNI millimetres."""
    x, y, z = point
    return (
        -x * SCALE + TRANSLATION[0],
        -y * SCALE + TRANSLATION[1],
        z * SCALE + TRANSLATION[2],
    )
