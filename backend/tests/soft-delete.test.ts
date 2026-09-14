/**
 * Soft-delete model coverage — Ecclesia Church Management System
 *
 * The automatic `isDeleted: false` filter is driven by a hand-kept list of model
 * names (SOFT_DELETABLE_MODELS). A model that has an `isDeleted` column but is
 * missing from that list leaks its deleted rows back into every list, count and
 * report — this is how a deleted RSVP kept occupying event capacity. The list is
 * pinned to the generated client's own datamodel, which is the exact name space
 * Prisma passes to the query extension.
 */
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { SOFT_DELETABLE_MODELS } from '../src/lib/prisma.js';

/** Every model that declares an `isDeleted` column, per the generated client. */
const modelsWithIsDeleted: string[] = Prisma.dmmf.datamodel.models
  .filter((model) => model.fields.some((field) => field.name === 'isDeleted'))
  .map((model) => model.name);

describe('soft-delete model coverage', () => {
  it('lists exactly the models that declare an isDeleted column', () => {
    expect([...SOFT_DELETABLE_MODELS].sort()).toEqual(modelsWithIsDeleted.sort());
  });
});
