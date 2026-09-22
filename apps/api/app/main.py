from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import scheduler
from .routers import admin, health


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Máquina de Conteúdo — API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(admin.router)
